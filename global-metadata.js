function read_string(reader, size) {
    return new TextDecoder().decode(reader.read(size));
}
function read_class(reader, offset, cls, version) {
    reader.seek(offset);
    return new cls(reader, version);
}
function read_func_array(reader, offset, size, func) {
    var result = [];
    reader.seek(offset);
    while (reader.tell() < offset + size) {
        result.push(func());
    }
    reader.seek(offset + size); // safe guard
    return result;
}
function read_compressed_uint32(reader) {
    var read = reader.readByte();
    if (read < 0x80) {
        return read;
    } else if ((read & 0xC0) === 0x80) {
        return (read & ~0x80) << 8 | reader.readByte();
    } else if ((read & 0xE0) === 0xC0) {
        return (read & ~0xC0) << 24 | reader.readByte() << 16 | reader.readByte() << 8 | reader.readByte();
    } else if (read === 0xF0) {
        return reader.readUInt();
    } else if (read == 0xFE) {
        return 0xFFFFFFFE >>> 0;
    } else if (read == 0xFF) {
        return 0xFFFFFFFF >>> 0;
    } else {
        throw Error("Invalid compressed integer format");
    }
}
function read_compressed_int32(reader) {
    var encoded = read_compressed_uint32(reader);
    if (encoded === (0xFFFFFFFF >>> 0)) {
        return 0x80000000;
    }
    var isNegative = (encoded & 1) !== 0;
    encoded = (encoded >>> 1);
    if (isNegative) {
        encoded = -(encoded + 1);
    }
    return encoded;
}

// classes
function GlobalMetadata(reader) {
    var _this = this;
    var resolved_names = {}; // memorize
    var resolve_name_internal = function(offset) {
        var temp = resolved_names[offset];
        if (temp !== undefined) return temp;
        reader.seek(_this.header.stringOffset + offset);
        var result = reader.readNullString();
        return resolved_names[offset] = result;
    }
    var resolve_name = function(cls) {
        cls.name = resolve_name_internal(cls.nameIndex);
        if (cls.namespaceIndex) {
            cls.namespace = resolve_name_internal(cls.namespaceIndex);
        }
    }
    var resolve_name_debug = function(cls) {
        cls.name = resolve_name_internal(cls.nameIndex);
        console.debug("Resolved Name: " + cls.name);
        if (cls.namespaceIndex) {
            cls.namespace = resolve_name_internal(cls.namespaceIndex);
            console.debug("Resolved Namespace: " + cls.namespace);
        }
    }
    var read_class_array = function(reader, offset, size, cls) {
        var result = [];
        reader.seek(offset);
        while (reader.tell() < offset + size) {
            result.push(new cls(reader, _this.header.version, _this.sizes)); // parse sizes which may possibly be used
        }
        reader.seek(offset + size); // safe guard
        return result;
    }
    this.header = new Il2CppGlobalMetadataHeader(reader);
    if (this.header.sanity !== 0xFAB11BAF) {
        throw Error("Magic number not match.");
    }
    if (this.header.version < 16 || this.header.version > 39 || [30, 32, 33, 34, 35, 36, 37, 38].includes(this.header.version)) {
        throw Error("Metadata version not supported.");
    }
    // Differentiate version 24
    if (this.header.version === 24) {
        if (this.header.stringLiteralOffset === 264) {
            // exclude rgctxEntries
            reader.seek(0);
            this.header = new Il2CppGlobalMetadataHeader(reader, 24.2);
        } else {
            this.imageDefinitions = read_class_array(reader, this.header.imagesOffset, this.header.imagesSize, Il2CppImageDefinition);
            if (this.imageDefinitions.some(entry => entry.token !== 1)) {
                this.header.version = 24.1;
            }
        }
    }

    
    if (this.header.version >= 38.0) {
        var getIndexSize = function (numberOfElements) {
            return (
                numberOfElements < 256 ? 1 :
                numberOfElements < 65536 ? 2 :
                4
            )
        }

        this.sizes = {};
        this.sizes.typeIndex = undefined; // from MetadataRegistration->typesCount
        this.sizes.typeDefinitionIndex = getIndexSize(
            this.header.typeDefinitions.count
        ); // from typeDefinitions.count
        this.sizes.genericContainerIndex = getIndexSize(
            this.header.genericContainers.count
        ); // from genericContainers.count
        this.sizes.parameterIndex = getIndexSize(
            this.header.parameters.count
        ); // from parameters.count

        // try to determine typeIndexSize
        if (this.header.interfaceOffsets.count > 0) {
            // TypeIndex + int32_t
            var entrySize = this.header.interfaceOffsets.size / this.header.interfaceOffsets.count;
            this.sizes.typeIndex = entrySize - 4;
        } else {
            console.warn("Cannot determine sizes.typeIndex");
        }
    } else {
        this.sizes = undefined;
    }


    // parse classes
    this.imageDefinitions = read_class_array(reader, this.header.imagesOffset, this.header.imagesSize, Il2CppImageDefinition);
    for (var temp of this.imageDefinitions) {
        resolve_name(temp);
    }
    if (this.header.version === 24.2 && this.header.assembliesSize < this.imageDefinitions.length * 68) {
        this.header.version = 24.4;
    }
    var fake_24_4 = false;
    if (this.header.version === 24.1 && this.header.assembliesSize === this.imageDefinitions.length * 64) {
        fake_24_4 = true;
    }
    if (fake_24_4) {
        this.header.version = 24.4;
    }
    this.assemblyDefs = read_class_array(reader, this.header.assembliesOffset, this.header.assembliesSize, Il2CppAssemblyDefinition);
    for (var temp of this.assemblyDefs) {
        resolve_name(temp.aname);
    }
    if (fake_24_4) {
        this.header.version = 24.1;
    }
    this.typeDefinitions = read_class_array(reader, this.header.typeDefinitionsOffset, this.header.typeDefinitionsSize, Il2CppTypeDefinition);
    for (var temp of this.typeDefinitions) {
        resolve_name(temp);
    }
    this.methodDefinitions = read_class_array(reader, this.header.methodsOffset, this.header.methodsSize, Il2CppMethodDefinition);
    for (var temp of this.methodDefinitions) {
        resolve_name(temp);
    }
    this.parameterDefinitions = read_class_array(reader, this.header.parametersOffset, this.header.parametersSize, Il2CppParameterDefinition);
    for (var temp of this.parameterDefinitions) {
        resolve_name(temp);
    }
    this.fieldDefinitions = read_class_array(reader, this.header.fieldsOffset, this.header.fieldsSize, Il2CppFieldDefinition);
    for (var temp of this.fieldDefinitions) {
        resolve_name(temp);
    }

    var fieldDefaultValues = read_class_array(reader, this.header.fieldDefaultValuesOffset, this.header.fieldDefaultValuesSize, Il2CppFieldDefaultValue);
    this.fieldDefaultValues = {};
    fieldDefaultValues.forEach(entry => this.fieldDefaultValues[entry.fieldIndex] = entry)

    var parameterDefaultValues = read_class_array(reader, this.header.parameterDefaultValuesOffset, this.header.parameterDefaultValuesSize, Il2CppParameterDefaultValue);
    this.parameterDefaultValues = {};
    parameterDefaultValues.forEach(x => this.parameterDefaultValues[x.parameterIndex] = x)

    this.propertyDefinitions = read_class_array(reader, this.header.propertiesOffset, this.header.propertiesSize, Il2CppPropertyDefinition);
    for (var temp of this.propertyDefinitions) {
        resolve_name(temp);
    }

    var knownTypes = {}; // [attrs, typeName, isKeyword]
    // window.metadata = this;
    // try resolve common types
    var knownTypeLocation = {
        "System": {
            "GuidEx": {
                "Field": {
                    "_a": ["private", "int", true],
                    "_b": ["private", "short", true],
                    "_d": ["private", "byte", true],
                }
            },
            "Char": {
                "Field": {
                    "m_value": ["private readonly", "char", true],
                    "MinValue": ["public const", "char", true],
                    "s_categoryForLatin1": ["private static readonly", "byte[]", true],
                    "UNICODE_PLANE00_END": ["internal const", "int", true],
                }
            },
            "CharEnumerator": {
                "Field": {
                    "_str": ["private", "string", true],
                    "_index": ["private", "int", true],
                    "_currentElement": ["private", "char", true],
                }
            },
            "DateTime": {
                "Property": {
                    "Date": ["", "DateTime", false],
                }
            },
            "Double": {
                "Field": {
                    "m_value": ["private readonly", "double", true],
                    "MinValue": ["public const", "double", true],
                    "NegativeZero": ["internal const", "double", true],
                }
            },
            "Single": {
                "Field": {
                    "m_value": ["private readonly", "float", true],
                    "MinValue": ["public const", "float", true],
                    "NegativeZero": ["internal const", "float", true],
                }
            },
        },
        "System.Text": {
            "UTF7Encoding": {
                "Field": {
                    "_base64Bytes": ["private", "byte[]", true],
                    "_base64Values": ["private", "sbyte[]", true],
                    "_directEncode": ["private", "bool[]", true],
                    "_allowOptionals": ["private", "bool", true],
                }
            },
            "UTF8Encoding.UTF8Encoder": {
                "Field": {
                    "surrogateChar": ["internal", "int", true],
                }
            },
            "UTF8Encoding.UTF8Decoder": {
                "Field": {
                    "bits": ["internal", "int", true],
                }
            },
            "UTF8Encoding": {
                "Field": {
                    "s_preamble": ["internal static readonly", "byte[]", true],
                    "_emitUTF8Identifier": ["internal readonly", "bool", true],
                    "_isThrowException": ["private", "bool", true],
                }
            },
            "UnicodeEncoding.Decoder": {
                "Field": {
                    "lastByte": ["internal", "int", true],
                    "lastChar": ["internal", "char", true],
                }
            },
            "UnicodeEncoding": {
                "Field": {
                    "s_bigEndianPreamble": ["private static readonly", "byte[]", true],
                    "isThrowException": ["internal", "bool", true],
                    "highLowPatternMask": ["private static readonly", "ulong", true],
                }
            },
        },
        "System.Runtime.Serialization": {
            "XmlReaderDelegator": {
                "Method": {
                    ".ctor": ["", "void", true],
                    "get_AttributeCount": ["", "int", true],
                    "get_IsEmptyElement": ["", "bool", true],
                    "ReadContentAsAnyType": ["", "object", true],
                    "ReadContentAsChar": ["", "char", true],
                    "ReadContentAsString": ["", "string", true],
                    "ReadContentAsBoolean": ["", "bool", true],
                    "ReadContentAsSingle": ["", "float", true],
                    "ReadContentAsDouble": ["", "double", true],
                    "ReadContentAsDecimal": ["", "Decimal", false],
                    "ReadContentAsBase64": ["", "byte[]", true],
                    "ReadContentAsDateTime": ["", "DateTime", false],
                    "ReadContentAsInt": ["", "int", true],
                    "ReadContentAsLong": ["", "long", true],
                    "ReadContentAsShort": ["", "short", true],
                    "ReadContentAsUnsignedByte": ["", "byte", true],
                    "ReadContentAsSignedByte": ["", "sbyte", true],
                    "ReadContentAsUnsignedInt": ["", "uint", true],
                    "ReadContentAsUnsignedLong": ["", "ulong", true],
                    "ReadContentAsUnsignedShort": ["", "ushort", true],
                    "ReadContentAsTimeSpan": ["", "TimeSpan", false],
                    "ReadContentAsGuid": ["", "Guid", false],
                    "ReadContentAsUri": ["", "Uri", false],
                    "ReadContentAsQName": ["", "XmlQualifiedName", false],
                    "ToChar": ["", "char", true],
                    "ToShort": ["", "short", true],
                    "ToByte": ["", "byte", true],
                    "ToSByte": ["", "sbyte", true],
                    "ToUInt32": ["", "uint", true],
                    "ToUInt16": ["", "ushort", true],
                }
            }
        },
        "System.Xml": {
            "BinXmlDateTime": {
                "Method": {
                    ".cctor": ["", "void", true],
                    "GetFractions": ["", "int", true],
                    "SqlDateTimeToString": ["", "string", true],
                    "SqlDateTimeToDateTime": ["", "DateTime", false],
                    "XsdKatmaiDateOffsetToDateTimeOffset": ["", "DateTimeOffset", false],
                    "GetKatmaiDateTicks": ["", "long", true],
                }
            }
        },
        "Unity.Burst.Intrinsics": {
            "Common": {
                "Method": {
                    "umul128": ["", "ulong", true],
                }
            },
            "v128": {
                "Field": {
                    "Byte0": ["public", "byte", true],
                    "SByte0": ["public", "sbyte", true],
                    "UShort0": ["public", "ushort", true],
                    "SShort0": ["public", "short", true],
                    "UInt0": ["public", "uint", true],
                    "SInt0": ["public", "int", true],
                    "ULong0": ["public", "ulong", true],
                    "SLong0": ["public", "long", true],
                    "Float0": ["public", "float", true],
                    "Double0": ["public", "double", true],
                    "Lo64": ["public", "v64", true],
                },
            },
            "v256": {
                "Field": {
                    "Lo128": ["public", "v128", true],
                },
            },
            "V64DebugView": {
                "Field": {
                    "m_Value": ["private", "v64", true],
                },
                "Method": {
                    "get_Byte": ["", "byte[]", true],
                    "get_SByte": ["", "sbyte[]", true],
                    "get_UShort": ["", "ushort[]", true],
                    "get_SShort": ["", "short[]", true],
                    "get_UInt": ["", "uint[]", true],
                    "get_SInt": ["", "int[]", true],
                    "get_Float": ["", "float[]", true],
                    "get_SLong": ["", "long[]", true],
                    "get_ULong": ["", "ulong[]", true],
                    "get_Double": ["", "double[]", true],
                }
            },
            "V128DebugView": {
                "Field": {
                    "m_Value": ["private", "v128", true],
                },
                "Method": {
                    "get_Byte": ["", "byte[]", true],
                    "get_SByte": ["", "sbyte[]", true],
                    "get_UShort": ["", "ushort[]", true],
                    "get_SShort": ["", "short[]", true],
                    "get_UInt": ["", "uint[]", true],
                    "get_SInt": ["", "int[]", true],
                    "get_Float": ["", "float[]", true],
                    "get_SLong": ["", "long[]", true],
                    "get_ULong": ["", "ulong[]", true],
                    "get_Double": ["", "double[]", true],
                }
            },
            "V256DebugView": {
                "Field": {
                    "m_Value": ["private", "v256", true],
                },
                "Method": {
                    "get_Byte": ["", "byte[]", true],
                    "get_SByte": ["", "sbyte[]", true],
                    "get_UShort": ["", "ushort[]", true],
                    "get_SShort": ["", "short[]", true],
                    "get_UInt": ["", "uint[]", true],
                    "get_SInt": ["", "int[]", true],
                    "get_Float": ["", "float[]", true],
                    "get_SLong": ["", "long[]", true],
                    "get_ULong": ["", "ulong[]", true],
                    "get_Double": ["", "double[]", true],
                }
            }
        },
        "UnityEngine": {
            "AnimatorClipInfo": {
                "Field": {
                    "m_ClipInstanceID": ["private", "int", true],
                    "m_Weight": ["private", "float", true],
                }
            },
            "AssetBundle": {
                "Method": {
                    "LoadAsset": ["", "Object", true],
                    "GetAllScenePaths": ["", "string[]", true],
                }
            }
        },
        "UnityEngine.Purchasing": {
            "ExponentialRetryPolicy": {
                "Field": {
                    "m_BaseRetryDelay": ["private readonly", "int", true],
                },
            },
            "FileReference": {
                "Field": {
                    "m_FilePath": ["private readonly", "string", true],
                },
            },
        },
        "UnityEngine.Rendering": {
            "CoreUtils": {
                "Field": {
                    "editMenuPriority1": ["public const", "int", true],
                },
            },
            "VolumeParameter": {
                "Field": {
                    "k_DebuggerDisplay": ["public const", "string", true],
                    "m_OverrideState": ["protected", "bool", true],
                },
            },
        },
        "UnityEngine.Rendering.Universal.Internal": {
            "DeferredConfig": {
                "Field": {
                    "kPreferredCBufferSize": ["public const", "int", true],
                    "kTilerDepth": ["public const", "int", true],
                    "kHasNativeQuadSupport": ["public const", "bool", true],
                },
            },
        },
        "UnityEngine.Timeline": {
            "TimeNotificationBehaviour": {
                "Field": {
                    "m_PreviousTime": ["private", "double", true],
                    "m_NeedSortNotifications": ["private", "bool", true],
                },
            },
        },
        "UnityEngine.U2D.Animation": {
            "SpriteLibrary": {
                "Field": {
                    "m_PreviousSpriteLibraryAsset": ["private", "int", true],
                    "m_PreviousModificationHash": ["private", "long", true],
                },
            },
        },
        "UnityEngine.UI": {
            "Text": {
                "Field": {
                    "m_Text": ["protected", "string", true],
                    "m_DisableFontTextureRebuiltCallback": ["protected", "bool", true],
                },
                "Property": {
                    "font": ["", "Font", false],
                    "text": ["", "string", true],
                    "fontSize": ["", "int", true],
                    "supportRichText": ["", "bool", true],
                    "lineSpacing": ["", "float", true],
                },
                "Method": {
                    ".ctor": ["", "void", true],
                },
            },
            "ColorBlock": {
                "Field": {
                    "m_NormalColor": ["private", "Color", false],
                    "m_FadeDuration": ["private", "float", true],
                },
                "Property": {
                    "normalColor": ["", "Color", false],
                },
            }
        },
        "UnityEngine.XR": {
            "XRNodeState": {
                "Property": {
                    "uniqueID": ["", "ulong", true],
                }
            }
        },
    }
    function addType(typeIndex, targetType) {
        knownTypes[typeIndex] = targetType;
        console.log("Resolved Type: " + typeIndex + " -> " + targetType[1]);
    }
    for (var typeDef of this.typeDefinitions) {
        var knownTypeLocationType = knownTypeLocation[typeDef.namespace];
        if (knownTypeLocationType === undefined) {
            continue;
        }
        var knownTypeLocationTypeDef = knownTypeLocationType[typeDef.name];
        if (knownTypeLocationTypeDef === undefined) {
            continue;
        }
        // Notice that Field index is different from Property/Method index so both values need to be specified
        if (knownTypeLocationTypeDef.Field) {
            for (var i = typeDef.fieldStart; i < typeDef.fieldStart + typeDef.field_count; ++i) {
                var fieldDef = this.fieldDefinitions[i];
                var targetName = fieldDef.name;
                var targetType = knownTypeLocationTypeDef.Field[targetName];
                if (targetType === undefined) {
                    continue;
                }
                var typeIndex = fieldDef.typeIndex;
                addType(typeIndex, targetType);
            }
        }
        if (knownTypeLocationTypeDef.Property) {
            for (var i = typeDef.propertyStart; i < typeDef.propertyStart + typeDef.property_count; ++i) {
                var propertyDef = this.propertyDefinitions[i];
                var targetName = propertyDef.name;
                var targetType = knownTypeLocationTypeDef.Property[targetName];
                if (targetType === undefined) {
                    continue;
                }
                var typeIndex = null;
                if (propertyDef.get >= 0) {
                    var methodDef = this.methodDefinitions[typeDef.methodStart + propertyDef.set];
                    typeIndex = methodDef.returnType;
                } else if (propertyDef.set >= 0) {
                    var methodDef = this.methodDefinitions[typeDef.methodStart + propertyDef.set];
                    var parameterDef = this.parameterDefinitions[methodDef.parameterStart];
                    if (parameterDef) {
                        typeIndex = parameterDef.typeIndex;
                    }
                }
                if (typeIndex !== null) {
                    addType(typeIndex, targetType);
                } else {
                    console.log("Failed to resolve Property: " + typeDef.name + "." + propertyDef.name);
                }
            }
        }
        if (knownTypeLocationTypeDef.Method) {
            for (var i = typeDef.methodStart; i < typeDef.methodStart + typeDef.method_count; ++i) {
                var methodDef = this.methodDefinitions[i];
                var targetName = methodDef.name;
                var typeIndex = methodDef.returnType;
                var targetType = knownTypeLocationTypeDef.Method[targetName];
                if (targetType === undefined) {
                    continue;
                }
                addType(typeIndex, targetType);
            }
        }
    }
    this.knownTypes = knownTypes;

    this.interfaceIndices = read_func_array(reader, this.header.interfacesOffset, this.header.interfacesSize, _=>reader.readInt());
    this.nestedTypeIndices = read_func_array(reader, this.header.nestedTypesOffset, this.header.nestedTypesSize, _=>reader.readInt());
    this.eventDefinitions = read_class_array(reader, this.header.eventsOffset, this.header.eventsSize, Il2CppEventDefinition);
    for (var temp of this.eventDefinitions) {
        resolve_name(temp);
    }
    this.genericContainers = read_class_array(reader, this.header.genericContainersOffset, this.header.genericContainersSize, Il2CppGenericContainer);
    this.genericParameters = read_class_array(reader, this.header.genericParametersOffset, this.header.genericParametersSize, Il2CppGenericParameter);
    for (var temp of this.genericParameters) {
        resolve_name(temp);
    }
    this.constraintIndices = read_func_array(reader, this.header.genericParameterConstraintsOffset, this.header.genericParameterConstraintsSize, _=>reader.readInt());
    this.vtableMethods = read_func_array(reader, this.header.vtableMethodsOffset, this.header.vtableMethodsSize, _=>reader.readUInt());
    this.stringLiterals = read_class_array(reader, this.header.stringLiteralOffset, this.header.stringLiteralSize, Il2CppStringLiteral);
    // resolve stringLiterals
    if (this.header.version >= 38.0) {
        for (var stringLiteralIndex = 0; stringLiteralIndex + 1 < this.stringLiterals.length; ++stringLiteralIndex) {
            var stringLiteral = this.stringLiterals[stringLiteralIndex];
            var stringLiteralNext = this.stringLiterals[stringLiteralIndex + 1];
            reader.seek(this.header.stringLiteralDataOffset + stringLiteral.dataIndex);
            stringLiteral.value = read_string(reader, stringLiteralNext.dataIndex - stringLiteral.dataIndex);
        }
        if (this.stringLiterals.length > 0) {
            this.stringLiterals[this.stringLiterals.length - 1].value = null;
        }
    } else {
        for (var stringLiteral of this.stringLiterals) {
            reader.seek(this.header.stringLiteralDataOffset + stringLiteral.dataIndex);
            stringLiteral.value = read_string(reader, stringLiteral.length);
        }
    }

    if (this.header.version >= 16) {
        this.fieldRefs = read_class_array(reader, this.header.fieldRefsOffset, this.header.fieldRefsSize, Il2CppFieldRef);
        if (this.header.version < 27) {
            this.metadataUsageLists = read_class_array(reader, this.header.metadataUsageListsOffset, this.header.metadataUsageListsCount, Il2CppMetadataUsageList);
            this.metadataUsagePairs = read_class_array(reader, this.header.metadataUsagePairsOffset, this.header.metadataUsagePairsCount, Il2CppMetadataUsagePair);
            this.metadataUsageDict = {}
            for (var i = 0; i < 6; ++i) {
                this.metadataUsageDict[Il2CppMetadataUsage[i]] = {};
            }
            for (var entry of this.metadataUsageLists) {
                for (var i = 0; i < entry.count; ++i) {
                    var offset = entry.start + i;
                    if (offset > self.metadataUsagePairs.length) {
                        continue;
                    }
                    var metadataUsagePair = self.metadataUsagePairs[offset];
                    var usage = Il2CppMetadataUsage[((metadataUsagePair.encodedSourceIndex) & 0xE0000000) >>> 29];
                    var decodedIndex = (metadataUsagePair.encodedSourceIndex & 0x1FFFFFFF) >>> (this.header.version >= 27);
                    this.metadataUsageDict[usage][metadataUsagePair.destinationIndex] = decodedIndex;
                }
            }
            self.metadataUsageCount = Object.entries(this.metadataUsageDict).filter(([_, value]) => Object.keys(value).length > 0).reduce(([key, _], [key2, __]) => key2 > key ? key2 : key, [0, 0])[0] + 1;
        }
    }
    if (this.header.version > 20 && this.header.version < 29) {
        this.attributeTypeRanges = read_class_array(reader, this.header.attributesInfoOffset, this.header.attributesInfoCount, Il2CppCustomAttributeTypeRange);
        this.attributeTypes = read_func_array(reader, this.header.attributeTypesOffset, this.header.attributeTypesCount, _=>reader.readInt());
    }
    if (this.header.version >= 29) {
        this.attributeDataRanges = read_class_array(reader, this.header.attributeDataRangeOffset, this.header.attributeDataRangeSize, Il2CppCustomAttributeDataRange);
        this.attributeDataSlice = [];
        for (var i = 0; i < this.attributeDataRanges.length - 1; i++) {
            var start = this.header.attributeDataOffset + this.attributeDataRanges[i].startOffset;
            var length = this.attributeDataRanges[i + 1].startOffset - this.attributeDataRanges[i].startOffset;
            reader.seek(start);
            this.attributeDataSlice.push(reader.readBytes(length));
        }
    }
    if (this.header.version > 24) {
        this.attributeTypeRangesDict = {};
        for (imageDef of this.imageDefinitions) {
            var dic = {};
            var end = imageDef.customAttributeStart + imageDef.customAttributeCount;
            for (var i = imageDef.customAttributeStart; i < end; i++) {
                if (this.header.version >= 29) {
                    dic[this.attributeDataRanges[i].token] = i;
                } else {
                    dic[this.attributeTypeRanges[i].token] = i;
                }
            }
            this.attributeTypeRangesDict[imageDef.nameIndex] = dic;
        }
    }
    if (this.header.version <= 24.1) {
        this.rgctxEntries = read_class_array(reader, this.header.rgctxEntriesOffset, this.header.rgctxEntriesCount, Il2CppRGCTXDefinition);
    }
    // resolve default values
    var dataIndicesSet = new Set();
    for (field of Object.values(this.fieldDefaultValues)) {
        if (field.dataIndex !== -1) {
            dataIndicesSet.add(field.dataIndex);
        }
    }
    for (field of Object.values(this.parameterDefaultValues)) {
        if (field.dataIndex !== -1) {
            dataIndicesSet.add(field.dataIndex);
        }
    }
    dataIndicesSet.add(this.header.fieldAndParameterDefaultValueDataSize);
    var dataIndices = Array.from(dataIndicesSet).sort((a, b) => a - b);
    this.fieldDefaultValuesRaw = {};
    var offset = this.header.fieldAndParameterDefaultValueDataOffset;
    for (var i = 0; i < dataIndices.length - 1; ++i) {
        var start = dataIndices[i];
        var end = dataIndices[i + 1];
        reader.seek(offset + start);
        this.fieldDefaultValuesRaw[start] = reader.readBytes(end - start);
    }
}

function Il2CppSectionMetadata(reader, version) {
    // introduced since 39.0 (should be 38.0+, not confirmed) 
    if (version >= 38.0) {
        this.offset = reader.readInt();
        this.size = reader.readInt();
        this.count = reader.readInt();
    } else {
        // dummy placeholders
        this.offset = undefined;
        this.size = undefined;
        this.count = undefined;
    }
}

function Il2CppGlobalMetadataHeader(reader, version) {
    this.sanity = reader.readUInt();
    this.version = reader.readInt();
    // override version if specified
    if (version !== undefined) {
        this.version = version;
    } else {
        version = this.version;
    }
    if (this.version >= 38.0) {
        this.stringLiterals = new Il2CppSectionMetadata(reader, version);
        // backward-compatible
        this.stringLiteralOffset = this.stringLiterals.offset;
        this.stringLiteralSize = this.stringLiterals.size;
    } else {
        this.stringLiteralOffset = reader.readUInt(); // string data for managed code
        this.stringLiteralSize = reader.readInt();
        // forward-compatible
        this.stringLiterals = new Il2CppSectionMetadata(reader, version);
        this.stringLiterals.offset = this.stringLiteralOffset;
        this.stringLiterals.size = this.stringLiteralSize;
    }
    if (this.version >= 38.0) {
        this.stringLiteralData = new Il2CppSectionMetadata(reader, version);
        // backward-compatible
        this.stringLiteralDataOffset = this.stringLiteralData.offset;
        this.stringLiteralDataSize = this.stringLiteralData.size;
    } else {
        this.stringLiteralDataOffset = reader.readUInt()
        this.stringLiteralDataSize = reader.readInt()
        // forward-compatible
        this.stringLiteralData = new Il2CppSectionMetadata(reader, version);
        this.stringLiteralData.offset = this.stringLiteralDataOffset;
        this.stringLiteralData.size = this.stringLiteralDataSize;
    }
    if (this.version >= 38.0) {
        this.strings = new Il2CppSectionMetadata(reader, version);
        // backward-compatible
        this.stringOffset = this.strings.offset;
        this.stringSize = this.strings.size;
    } else {
        this.stringOffset = reader.readUInt() // string data for metadata
        this.stringSize = reader.readInt()
        // forward-compatible
        this.strings = new Il2CppSectionMetadata(reader, version);
        this.strings.offset = this.stringOffset;
        this.strings.size = this.stringSize;
    }
    if (this.version >= 38.0) {
        this.events = new Il2CppSectionMetadata(reader, version);
        // backward-compatible
        this.eventsOffset = this.events.offset;
        this.eventsSize = this.events.size;
    } else {
        this.eventsOffset = reader.readUInt() // Il2CppEventDefinition
        this.eventsSize = reader.readInt()
        // forward-compatible
        this.events = new Il2CppSectionMetadata(reader, version);
        this.events.offset = this.eventsOffset;
        this.events.size = this.eventsSize;
    }
    if (this.version >= 38.0) {
        this.properties = new Il2CppSectionMetadata(reader, version);
        // backward-compatible
        this.propertiesOffset = this.properties.offset;
        this.propertiesSize = this.properties.size;
    } else {
        this.propertiesOffset = reader.readUInt() // Il2CppPropertyDefinition
        this.propertiesSize = reader.readInt()
        // forward-compatible
        this.properties = new Il2CppSectionMetadata(reader, version);
        this.properties.offset = this.propertiesOffset;
        this.properties.size = this.propertiesSize;
    }
    if (this.version >= 38.0) {
        this.methods = new Il2CppSectionMetadata(reader, version);
        // backward-compatible
        this.methodsOffset = this.methods.offset;
        this.methodsSize = this.methods.size;
    } else {
        this.methodsOffset = reader.readUInt() // Il2CppMethodDefinition
        this.methodsSize = reader.readInt()
        // forward-compatible
        this.methods = new Il2CppSectionMetadata(reader, version);
        this.methods.offset = this.methodsOffset;
        this.methods.size = this.methodsSize;
    }
    if (this.version >= 38.0) {
        this.parameterDefaultValues = new Il2CppSectionMetadata(reader, version);
        // backward-compatible
        this.parameterDefaultValuesOffset = this.parameterDefaultValues.offset;
        this.parameterDefaultValuesSize = this.parameterDefaultValues.size;
    } else {
        this.parameterDefaultValuesOffset = reader.readUInt() // Il2CppParameterDefaultValue
        this.parameterDefaultValuesSize = reader.readInt()
        // forward-compatible
        this.parameterDefaultValues = new Il2CppSectionMetadata(reader, version);
        this.parameterDefaultValues.offset = this.parameterDefaultValuesOffset;
        this.parameterDefaultValues.size = this.parameterDefaultValuesSize;
    }
    if (this.version >= 38.0) {
        this.fieldDefaultValues = new Il2CppSectionMetadata(reader, version);
        // backward-compatible
        this.fieldDefaultValuesOffset = this.fieldDefaultValues.offset;
        this.fieldDefaultValuesSize = this.fieldDefaultValues.size;
    } else {
        this.fieldDefaultValuesOffset = reader.readUInt() // Il2CppFieldDefaultValue
        this.fieldDefaultValuesSize = reader.readInt()
        // forward-compatible
        this.fieldDefaultValues = new Il2CppSectionMetadata(reader, version);
        this.fieldDefaultValues.offset = this.fieldDefaultValuesOffset;
        this.fieldDefaultValues.size = this.fieldDefaultValuesSize;
    }
    if (this.version >= 38.0) {
        this.fieldAndParameterDefaultValueData = new Il2CppSectionMetadata(reader, version);
        // backward-compatible
        this.fieldAndParameterDefaultValueDataOffset = this.fieldAndParameterDefaultValueData.offset;
        this.fieldAndParameterDefaultValueDataSize = this.fieldAndParameterDefaultValueData.size;
    } else {
        this.fieldAndParameterDefaultValueDataOffset = reader.readUInt() // uint8_t
        this.fieldAndParameterDefaultValueDataSize = reader.readInt()
        // forward-compatible
        this.fieldAndParameterDefaultValueData = new Il2CppSectionMetadata(reader, version);
        this.fieldAndParameterDefaultValueData.offset = this.fieldAndParameterDefaultValueDataOffset;
        this.fieldAndParameterDefaultValueData.size = this.fieldAndParameterDefaultValueDataSize;
    }
    if (this.version >= 38.0) {
        this.fieldMarshaledSizes = new Il2CppSectionMetadata(reader, version);
        // backward-compatible
        this.fieldMarshaledSizesOffset = this.fieldMarshaledSizes.offset;
        this.fieldMarshaledSizesSize = this.fieldMarshaledSizes.size;
    } else {
        this.fieldMarshaledSizesOffset = reader.readInt() // Il2CppFieldMarshaledSize
        this.fieldMarshaledSizesSize = reader.readInt()
        // forward-compatible
        this.fieldMarshaledSizes = new Il2CppSectionMetadata(reader, version);
        this.fieldMarshaledSizes.offset = this.fieldMarshaledSizesOffset;
        this.fieldMarshaledSizes.size = this.fieldMarshaledSizesSize;
    }
    if (this.version >= 38.0) {
        this.parameters = new Il2CppSectionMetadata(reader, version);
        // backward-compatible
        this.parametersOffset = this.parameters.offset;
        this.parametersSize = this.parameters.size;
    } else {
        this.parametersOffset = reader.readUInt() // Il2CppParameterDefinition
        this.parametersSize = reader.readInt()
        // forward-compatible
        this.parameters = new Il2CppSectionMetadata(reader, version);
        this.parameters.offset = this.parametersOffset;
        this.parameters.size = this.parametersSize;
    }
    if (this.version >= 38.0) {
        this.fields = new Il2CppSectionMetadata(reader, version);
        // backward-compatible
        this.fieldsOffset = this.fields.offset;
        this.fieldsSize = this.fields.size;
    } else {
        this.fieldsOffset = reader.readUInt() // Il2CppFieldDefinition
        this.fieldsSize = reader.readInt()
        // forward-compatible
        this.fields = new Il2CppSectionMetadata(reader, version);
        this.fields.offset = this.fieldsOffset;
        this.fields.size = this.fieldsSize;
    }
    if (this.version >= 38.0) {
        this.genericParameters = new Il2CppSectionMetadata(reader, version);
        // backward-compatible
        this.genericParametersOffset = this.genericParameters.offset;
        this.genericParametersSize = this.genericParameters.size;
    } else {
        this.genericParametersOffset = reader.readUInt() // Il2CppGenericParameter
        this.genericParametersSize = reader.readInt()
        // forward-compatible
        this.genericParameters = new Il2CppSectionMetadata(reader, version);
        this.genericParameters.offset = this.genericParametersOffset;
        this.genericParameters.size = this.genericParametersSize;
    }
    if (this.version >= 38.0) {
        this.genericParameterConstraints = new Il2CppSectionMetadata(reader, version);
        // backward-compatible
        this.genericParameterConstraintsOffset = this.genericParameterConstraints.offset;
        this.genericParameterConstraintsSize = this.genericParameterConstraints.size;
    } else {
        this.genericParameterConstraintsOffset = reader.readUInt() // TypeIndex
        this.genericParameterConstraintsSize = reader.readInt()
        // forward-compatible
        this.genericParameterConstraints = new Il2CppSectionMetadata(reader, version);
        this.genericParameterConstraints.offset = this.genericParameterConstraintsOffset;
        this.genericParameterConstraints.size = this.genericParameterConstraintsSize;
    }
    if (this.version >= 38.0) {
        this.genericContainers = new Il2CppSectionMetadata(reader, version);
        // backward-compatible
        this.genericContainersOffset = this.genericContainers.offset;
        this.genericContainersSize = this.genericContainers.size;
    } else {
        this.genericContainersOffset = reader.readUInt() // Il2CppGenericContainer
        this.genericContainersSize = reader.readInt()
        // forward-compatible
        this.genericContainers = new Il2CppSectionMetadata(reader, version);
        this.genericContainers.offset = this.genericContainersOffset;
        this.genericContainers.size = this.genericContainersSize;
    }
    if (this.version >= 38.0) {
        this.nestedTypes = new Il2CppSectionMetadata(reader, version);
        // backward-compatible
        this.nestedTypesOffset = this.nestedTypes.offset;
        this.nestedTypesSize = this.nestedTypes.size;
    } else {
        this.nestedTypesOffset = reader.readUInt() // Il2CppTypeDefinitionIndex
        this.nestedTypesSize = reader.readInt()
        // forward-compatible
        this.nestedTypes = new Il2CppSectionMetadata(reader, version);
        this.nestedTypes.offset = this.nestedTypesOffset;
        this.nestedTypes.size = this.nestedTypesSize;
    }
    if (this.version >= 38.0) {
        this.interfaces = new Il2CppSectionMetadata(reader, version);
        // backward-compatible
        this.interfacesOffset = this.interfaces.offset;
        this.interfacesSize = this.interfaces.size;
    } else {
        this.interfacesOffset = reader.readUInt() // TypeIndex
        this.interfacesSize = reader.readInt()
        // forward-compatible
        this.interfaces = new Il2CppSectionMetadata(reader, version);
        this.interfaces.offset = this.interfacesOffset;
        this.interfaces.size = this.interfacesSize;
    }
    if (this.version >= 38.0) {
        this.vtableMethods = new Il2CppSectionMetadata(reader, version);
        // backward-compatible
        this.vtableMethodsOffset = this.vtableMethods.offset;
        this.vtableMethodsSize = this.vtableMethods.size;
    } else {
        this.vtableMethodsOffset = reader.readUInt() // EncodedMethodIndex
        this.vtableMethodsSize = reader.readInt()
        // forward-compatible
        this.vtableMethods = new Il2CppSectionMetadata(reader, version);
        this.vtableMethods.offset = this.vtableMethodsOffset;
        this.vtableMethods.size = this.vtableMethodsSize;
    }
    if (this.version >= 38.0) {
        this.interfaceOffsets = new Il2CppSectionMetadata(reader, version);
        // backward-compatible
        this.interfaceOffsetsOffset = this.interfaceOffsets.offset;
        this.interfaceOffsetsSize = this.interfaceOffsets.size;
    } else {
        this.interfaceOffsetsOffset = reader.readInt(); // Il2CppInterfaceOffsetPair
        this.interfaceOffsetsSize = reader.readInt();
        // forward-compatible
        this.interfaceOffsets = new Il2CppSectionMetadata(reader, version);
        this.interfaceOffsets.offset = this.interfaceOffsetsOffset;
        this.interfaceOffsets.size = this.interfaceOffsetsSize;
    }
    if (this.version >= 38.0) {
        this.typeDefinitions = new Il2CppSectionMetadata(reader, version);
        // backward-compatible
        this.typeDefinitionsOffset = this.typeDefinitions.offset;
        this.typeDefinitionsSize = this.typeDefinitions.size;
    } else {
        this.typeDefinitionsOffset = reader.readUInt() // Il2CppIl2CppTypeDefinition
        this.typeDefinitionsSize = reader.readInt()
        // forward-compatible
        this.typeDefinitions = new Il2CppSectionMetadata(reader, version);
        this.typeDefinitions.offset = this.typeDefinitionsOffset;
        this.typeDefinitions.size = this.typeDefinitionsSize;
    }
    if (this.version <= 24.1) {
        this.rgctxEntriesOffset = reader.readUInt() // Il2CppRGCTXDefinition
        this.rgctxEntriesCount = reader.readInt()
    } else {
        this.rgctxEntriesOffset = undefined;
        this.rgctxEntriesCount = undefined;
    }
    if (this.version >= 38.0) {
        this.images = new Il2CppSectionMetadata(reader, version);
        // backward-compatible
        this.imagesOffset = this.images.offset;
        this.imagesSize = this.images.size;
    } else {
        this.imagesOffset = reader.readUInt() // Il2CppImageDefinition
        this.imagesSize = reader.readInt()
        // forward-compatible
        this.images = new Il2CppSectionMetadata(reader, version);
        this.images.offset = this.imagesOffset;
        this.images.size = this.imagesSize;
    }
    if (this.version >= 38.0) {
        this.assemblies = new Il2CppSectionMetadata(reader, version);
        // backward-compatible
        this.assembliesOffset = this.assemblies.offset;
        this.assembliesSize = this.assemblies.size;
    } else {
        this.assembliesOffset = reader.readUInt() // Il2CppIl2CppAssemblyDefinition
        this.assembliesSize = reader.readInt()
        // forward-compatible
        this.assemblies = new Il2CppSectionMetadata(reader, version);
        this.assemblies.offset = this.assembliesOffset;
        this.assemblies.size = this.assembliesSize;
    }
    if (19 <= this.version && this.version <= 24.5) {
        this.metadataUsageListsOffset = reader.readUInt() // Il2CppMetadataUsageList
        this.metadataUsageListsCount = reader.readInt()
        this.metadataUsagePairsOffset = reader.readUInt() // Il2CppMetadataUsagePair
        this.metadataUsagePairsCount = reader.readInt()
    } else {
        this.metadataUsageListsOffset = undefined;
        this.metadataUsageListsCount = undefined;
        this.metadataUsagePairsOffset = undefined;
        this.metadataUsagePairsCount = undefined;
    }
    if (this.version >= 38.0) {
        this.fieldRefs = new Il2CppSectionMetadata(reader, version);
        // backward-compatible
        this.fieldRefsOffset = this.fieldRefs.offset;
        this.fieldRefsSize = this.fieldRefs.size;
    } else if (this.version >= 19) {
        this.fieldRefsOffset = reader.readUInt() // Il2CppFieldRef
        this.fieldRefsSize = reader.readInt();
        // forward-compatible
        this.fieldRefs = new Il2CppSectionMetadata(reader, version);
        this.fieldRefs.offset = this.fieldRefsOffset;
        this.fieldRefs.size = this.fieldRefsSize;
    } else {
        this.fieldRefsOffset = undefined;
        this.fieldRefsSize = undefined;
        this.fieldRefs = new Il2CppSectionMetadata(reader, version);
    }
    if (this.version >= 38.0) {
        this.referencedAssemblies = new Il2CppSectionMetadata(reader, version);
        // backward-compatible
        this.referencedAssembliesOffset = this.referencedAssemblies.offset;
        this.referencedAssembliesSize = this.referencedAssemblies.size;
    } else if (this.version >= 20) {
        this.referencedAssembliesOffset = reader.readInt() // int32_t
        this.referencedAssembliesSize = reader.readInt()
        // forward-compatible
        this.referencedAssemblies = new Il2CppSectionMetadata(reader, version);
        this.referencedAssemblies.offset = this.referencedAssembliesOffset;
        this.referencedAssemblies.size = this.referencedAssembliesSize;
    } else {
        this.referencedAssembliesOffset = undefined;
        this.referencedAssembliesSize = undefined;
        this.referencedAssemblies = new Il2CppSectionMetadata(reader, version);
    }
    if (this.version >= 21 && this.version <= 27.2) {
        this.attributesInfoOffset = reader.readUInt() // Il2CppCustomAttributeTypeRange
        this.attributesInfoCount = reader.readInt()
        this.attributeTypesOffset = reader.readUInt() // TypeIndex
        this.attributeTypesCount = reader.readInt()
    } else {
        this.attributesInfoOffset = undefined;
        this.attributesInfoCount = undefined;
        this.attributeTypesOffset = undefined;
        this.attributeTypesCount = undefined;
    }
    if (this.version >= 38.0) {
        this.attributeData = new Il2CppSectionMetadata(reader, version);
        this.attributeDataRanges = new Il2CppSectionMetadata(reader, version);
        // backward-compatible
        this.attributeDataOffset = this.attributeData.offset;
        this.attributeDataSize = this.attributeData.size;
        this.attributeDataRangeOffset = this.attributeDataRanges.offset;
        this.attributeDataRangeSize = this.attributeDataRanges.size;
    } else if (this.version >= 29) {
        this.attributeDataOffset = reader.readUInt();
        this.attributeDataSize = reader.readInt();
        this.attributeDataRangeOffset = reader.readUInt();
        this.attributeDataRangeSize = reader.readInt();
        // forward-compatible
        this.attributeData = new Il2CppSectionMetadata(reader, version);
        this.attributeData.offset = this.attributeDataOffset;
        this.attributeData.size = this.attributeDataSize;
        this.attributeDataRanges = new Il2CppSectionMetadata(reader, version);
        this.attributeDataRanges.offset = this.attributeDataRangeOffset;
        this.attributeDataRanges.size = this.attributeDataRangeSize;
    }
    if (this.version >= 38.0) {
        this.unresolvedIndirectCallParameterTypes = new Il2CppSectionMetadata(reader, version); // TypeIndex
        this.unresolvedIndirectCallParameterRanges = new Il2CppSectionMetadata(reader, version); // Il2CppMetadataRange
        // backward-compatible
        this.unresolvedVirtualCallParameterTypesOffset = this.unresolvedIndirectCallParameterTypes.offset;
        this.unresolvedVirtualCallParameterTypesSize = this.unresolvedIndirectCallParameterTypes.size;
        this.unresolvedVirtualCallParameterRangesOffset = this.unresolvedIndirectCallParameterRanges.offset;
        this.unresolvedVirtualCallParameterRangesSize = this.unresolvedIndirectCallParameterRanges.size;
    } else if (this.version >= 22) {
        this.unresolvedVirtualCallParameterTypesOffset = reader.readInt() // TypeIndex
        this.unresolvedVirtualCallParameterTypesSize = reader.readInt()
        this.unresolvedVirtualCallParameterRangesOffset = reader.readInt() // Il2CppRange
        this.unresolvedVirtualCallParameterRangesSize = reader.readInt();
        // forward-compatible
        this.unresolvedIndirectCallParameterTypes = new Il2CppSectionMetadata(reader, version);
        this.unresolvedIndirectCallParameterTypes.offset = this.unresolvedVirtualCallParameterTypesOffset;
        this.unresolvedIndirectCallParameterTypes.size = this.unresolvedVirtualCallParameterTypesSize;
        this.unresolvedIndirectCallParameterRanges = new Il2CppSectionMetadata(reader, version);
        this.unresolvedIndirectCallParameterRanges.offset = this.unresolvedVirtualCallParameterRangesOffset;
        this.unresolvedIndirectCallParameterRanges.size = this.unresolvedVirtualCallParameterRangesSize;
    }
    if (this.version >= 38.0) {
        this.windowsRuntimeTypeNames = new Il2CppSectionMetadata(reader, version);
        // backward-compatible
        this.windowsRuntimeTypeNamesOffset = this.windowsRuntimeTypeNames.offset;
        this.windowsRuntimeTypeNamesSize = this.windowsRuntimeTypeNames.size;
    } else if (this.version >= 23) {
        this.windowsRuntimeTypeNamesOffset = reader.readInt() // Il2CppWindowsRuntimeTypeNamePair
        this.windowsRuntimeTypeNamesSize = reader.readInt()
        // forward-compatible
        this.windowsRuntimeTypeNames = new Il2CppSectionMetadata(reader, version);
        this.windowsRuntimeTypeNames.offset = this.windowsRuntimeTypeNamesOffset;
        this.windowsRuntimeTypeNames.size = this.windowsRuntimeTypeNamesSize;
    }
    if (this.version >= 38.0) {
        this.windowsRuntimeStrings = new Il2CppSectionMetadata(reader, version);
        // backward-compatible
        this.windowsRuntimeStringsOffset = this.windowsRuntimeStrings.offset;
        this.windowsRuntimeStringsSize = this.windowsRuntimeStrings.size;
    } else if (this.version >= 27) {
        this.windowsRuntimeStringsOffset = reader.readInt() // const char*
        this.windowsRuntimeStringsSize = reader.readInt()
        // forward-compatible
        this.windowsRuntimeStrings = new Il2CppSectionMetadata(reader, version);
        this.windowsRuntimeStrings.offset = this.windowsRuntimeStringsOffset;
        this.windowsRuntimeStrings.size = this.windowsRuntimeStringsSize;
    }
    if (this.version >= 38.0) {
        this.exportedTypeDefinitions = new Il2CppSectionMetadata(reader, version); // TypeDefinitionIndex
        // backward-compatible
        this.exportedIl2CppTypeDefinitionsOffset = this.exportedTypeDefinitions.offset;
        this.exportedIl2CppTypeDefinitionsSize = this.exportedTypeDefinitions.size;
    } else if (this.version >= 24) {
        this.exportedIl2CppTypeDefinitionsOffset = reader.readInt() // Il2CppTypeDefinitionIndex
        this.exportedIl2CppTypeDefinitionsSize = reader.readInt();
        // forward-compatible
        this.exportedTypeDefinitions = new Il2CppSectionMetadata(reader, version);
        this.exportedTypeDefinitions.offset = this.exportedIl2CppTypeDefinitionsOffset;
        this.exportedTypeDefinitions.size = this.exportedIl2CppTypeDefinitionsSize;
    }
}

function readIndex(reader, size) {
    if (size === 1) return reader.readByte();
    if (size === 2) return reader.readUShort();
    if (size === 4) return reader.readUInt();
}


function Il2CppAssemblyDefinition(reader, version) {
    this.imageIndex = reader.readInt();
    if (version >= 24.1) {
        this.token = reader.readUInt();
    }
    if (version <= 24) {
        this.customAttributeIndex = reader.readInt();
    }
    if (version >= 38.0) {
        this.moduleToken = reader.readUInt();
    }
    if (version >= 20) {
        this.referencedAssemblyStart = reader.readInt();
        this.referencedAssemblyCount = reader.readInt();
    }
    this.aname = new Il2CppAssemblyNameDefinition(reader, version);
}
function Il2CppAssemblyNameDefinition(reader, version) {
    this.nameIndex = reader.readUInt();
    this.cultureIndex = reader.readUInt();
    if (version <= 24.3) {
        this.hashValueIndex = reader.readInt();
    }
    this.publicKeyIndex = reader.readUInt();
    this.hash_alg = reader.readUInt();
    this.hash_len = reader.readInt();
    this.flags = reader.readUInt();
    this.major = reader.readInt();
    this.minor = reader.readInt();
    this.build = reader.readInt();
    this.revision = reader.readInt();
    this.public_key_token = reader.read(8);
}
function Il2CppImageDefinition(reader, version, sizes) { // renamed to Il2CppImageGlobalMetadata
    this.nameIndex = reader.readUInt();
    this.assemblyIndex = reader.readInt();
    if (version >= 38.0) {
        this.typeStart = readIndex(reader, sizes.typeDefinitionIndex);
    } else {
        this.typeStart = reader.readInt();
    };
    this.typeCount = reader.readUInt();
    if (version >= 38.0) {
        this.exportedTypeStart = readIndex(reader, sizes.typeDefinitionIndex);
        this.exportedTypeCount = reader.readUInt();
    } else if (version >= 24.0) {
        this.exportedTypeStart = reader.readInt();
        this.exportedTypeCount = reader.readUInt();
    }
    this.entryPointIndex = reader.readInt();
    if (version >= 19.0) {
        this.token = reader.readUInt();
    }
    if (version >= 24.1) {
        this.customAttributeStart = reader.readInt();
        this.customAttributeCount = reader.readUInt();
    }
}
function Il2CppTypeDefinition(reader, version, sizes) {
    
    this.nameIndex = reader.readUInt();
    this.namespaceIndex = reader.readUInt();
    if (version <= 24) {
        this.customAttributeIndex = reader.readInt();
    }
    if (version >= 38.0) {
        this.byvalTypeIndex = readIndex(reader, sizes.typeIndex);
    } else {
        this.byvalTypeIndex = reader.readInt();
    }
    if (version <= 24.5) {
        this.byrefTypeIndex = reader.readInt();
    }
    if (version >= 38.0) {
        this.declaringTypeIndex = readIndex(reader, sizes.typeIndex);
        this.parentIndex = readIndex(reader, sizes.typeIndex);
    } else {
        this.declaringTypeIndex = reader.readInt();
        this.parentIndex = reader.readInt();
    }
    if (version < 38.0) {
        this.elementTypeIndex = reader.readInt(); // we can probably remove this one. Only used for enums
    }
    if (version <= 24.1) {
        this.rgctxStartIndex = reader.readInt();
        this.rgctxCount = reader.readInt();
    }
    if (version >= 38.0) {
        this.genericContainerIndex = readIndex(reader, sizes.genericContainerIndex);
    } else {
        this.genericContainerIndex = reader.readInt();
    }
    if (version <= 22) {
        this.delegateWrapperFromManagedToNativeIndex = reader.readInt();
        this.marshalingFunctionsIndex = reader.readInt();
        if (version >= 21) {
            this.ccwFunctionIndex = reader.readInt();
            this.guidIndex = reader.readInt();
        }
    }
    this.flags = reader.readUInt();
    this.fieldStart = reader.readInt();
    this.methodStart = reader.readInt();
    this.eventStart = reader.readInt();
    this.propertyStart = reader.readInt();
    this.nestedTypesStart = reader.readInt();
    this.interfacesStart = reader.readInt();
    this.vtableStart = reader.readInt();
    this.interfaceOffsetsStart = reader.readInt();
    this.method_count = reader.readUShort();
    this.property_count = reader.readUShort();
    this.field_count = reader.readUShort();
    this.event_count = reader.readUShort();
    this.nested_type_count = reader.readUShort();
    this.vtable_count = reader.readUShort();
    this.interfaces_count = reader.readUShort();
    this.interface_offsets_count = reader.readUShort();
    // bitfield to portably encode boolean values as single bits
    // 01 - valuetype;
    // 02 - enumtype;
    // 03 - has_finalize;
    // 04 - has_cctor;
    // 05 - is_blittable;
    // 06 - is_import_or_windows_runtime;
    // 07-10 - One of nine possible PackingSize values (0, 1, 2, 4, 8, 16, 32, 64, or 128)
    // 11 - PackingSize is default
    // 12 - ClassSize is default
    // 13-16 - One of nine possible PackingSize values (0, 1, 2, 4, 8, 16, 32, 64, or 128) - the specified packing size (even for explicit layouts)
    this.bitfield = reader.readUInt();
    if (version >= 19) {
        this.token = reader.readUInt();
    }
    this.IsValueType = this.bitfield & 0x1 === 1;
    this.IsEnum = (this.bitfield >> 1) & 0x1 === 1;
}

function Il2CppMethodDefinition(reader, version, sizes) {
    this.nameIndex = reader.readUInt();
    if (version >= 38.0) {
        this.declaringType = readIndex(reader, sizes.typeDefinitionIndex);
    } else {
        this.declaringType = reader.readInt();
    }
    if (version >= 38.0) {
        this.returnType = readIndex(reader, sizes.typeIndex);
    } else {
        this.returnType = reader.readInt();
    }
    if (version >= 31) {
        this.returnParameterToken = reader.readInt();
    }
    if (version >= 38.0) {
        this.parameterStart = readIndex(reader, sizes.parameterIndex);
    } else {
        this.parameterStart = reader.readInt();
    }
    if (version <= 24) {
        this.customAttributeIndex = reader.readInt();
    }
    if (version >= 38.0) {
        this.genericContainerIndex = readIndex(reader, sizes.genericContainerIndex);
    } else {
        this.genericContainerIndex = reader.readInt();
    }
    if (version <= 24.1) {
        this.methodIndex = reader.readInt();
        this.invokerIndex = reader.readInt();
        this.delegateWrapperIndex = reader.readInt();
        this.rgctxStartIndex = reader.readInt();
        this.rgctxCount = reader.readInt();
    }
    this.token = reader.readUInt();
    this.flags = reader.readUShort();
    this.iflags = reader.readUShort();
    this.slot = reader.readUShort();
    this.parameterCount = reader.readUShort();
}

function Il2CppParameterDefinition(reader, version, sizes) {
    this.nameIndex = reader.readUInt();
    this.token = reader.readUInt();
    if (version <= 24) {
        this.customAttributeIndex = reader.readInt();
    }
    if (version >= 38.0) {
        this.typeIndex = readIndex(reader, sizes.typeIndex);
    } else {
        this.typeIndex = reader.readInt();
    }
}

function Il2CppFieldDefinition(reader, version, sizes) {
    this.nameIndex = reader.readUInt();
    if (version >= 38.0) {
        this.typeIndex = readIndex(reader, sizes.typeIndex);
    } else {
        this.typeIndex = reader.readInt();
    }
    if (version <= 24) {
        this.customAttributeIndex = reader.readInt();
    }
    if (version >= 19) {
        this.token = reader.readUInt();
    }
}

function Il2CppFieldDefaultValue(reader, version, sizes) {
    this.fieldIndex = reader.readInt();
    if (version >= 38.0) {
        this.typeIndex = readIndex(reader, sizes.typeIndex);
    } else {
        this.typeIndex = reader.readInt();
    }
    this.dataIndex = reader.readInt();
}

function Il2CppPropertyDefinition(reader, version) {
    this.nameIndex = reader.readUInt();
    this.get = reader.readInt();
    this.set = reader.readInt();
    this.attrs = reader.readUInt();
    if (version <= 24) {
        this.customAttributeIndex = reader.readInt();
    }
    if (version >= 19) {
        this.token = reader.readUInt();
    }
}

function Il2CppCustomAttributeTypeRange(reader, version) {
    if (version >= 24.1) {
        this.token = reader.readUInt();
    }
    this.start = reader.readInt();
    this.count = reader.readInt();
}

function Il2CppMetadataUsageList(reader, version) {
    this.start = reader.readUInt();
    this.count = reader.readUInt();
}

function Il2CppMetadataUsagePair(reader, version) {
    this.destinationIndex = reader.readUInt();
    this.encodedSourceIndex = reader.readUInt();
}

function Il2CppStringLiteral(reader, version) {
    if (version < 38.0) {
        this.length = reader.readUInt();
    };
    this.dataIndex = reader.readInt();
}

function Il2CppParameterDefaultValue(reader, version, sizes) {
    this.parameterIndex = reader.readInt();
    if (version >= 38.0) {
        this.typeIndex = readIndex(reader, sizes.typeIndex);
    } else {
        this.typeIndex = reader.readInt();
    }
    this.dataIndex = reader.readInt();
}

function Il2CppEventDefinition(reader, version, sizes) {
    this.nameIndex = reader.readUInt();
    if (version >= 38.0) {
        this.typeIndex = readIndex(reader, sizes.typeIndex);
    } else {
        this.typeIndex = reader.readInt();
    }
    this.add = reader.readInt();
    this.remove = reader.readInt();
    this.raise = reader.readInt();
    if (version <= 24) {
        this.customAttributeIndex = reader.readInt();
    }
    if (version >= 19) {
        this.token = reader.readUInt();
    }
}

function Il2CppGenericContainer(reader, version) {
    /* index of the generic type definition or the generic method definition corresponding to this container */
    this.ownerIndex = reader.readInt(); // either index into Il2CppClass metadata array or Il2CppIl2CppMethodDefinition array
    this.type_argc = reader.readInt();
    /* If true, we're a generic method, otherwise a generic type definition. */
    this.is_method = reader.readInt();
    /* Our type parameters. */
    this.genericParameterStart = reader.readInt();
}

function Il2CppFieldRef(reader, version, sizes) {
    if (version >= 38.0) {
        this.typeIndex = readIndex(reader, sizes.typeIndex);
    } else {
        this.typeIndex = reader.readInt();
    }
    this.fieldIndex = reader.readInt(); // local offset into type fields
}

function Il2CppGenericParameter(reader, version, sizes) {
    if (version >= 38.0) {
        this.ownerIndex = readIndex(reader, sizes.genericContainerIndex);
    } else {
        this.ownerIndex = reader.readInt();  /* Type or method this parameter was defined in. */
    }
    this.nameIndex = reader.readUInt();
    this.constraintsStart = reader.readShort();
    this.constraintsCount = reader.readShort();
    this.num = reader.readUShort();
    this.flags = reader.readUShort();
}

const Il2CppRGCTXDataType = [
    'IL2CPP_RGCTX_DATA_INVALID',
    'IL2CPP_RGCTX_DATA_TYPE',
    'IL2CPP_RGCTX_DATA_CLASS',
    'IL2CPP_RGCTX_DATA_METHOD',
    'IL2CPP_RGCTX_DATA_ARRAY',
    'IL2CPP_RGCTX_DATA_CONSTRAINED'
];

function Il2CppRGCTXDefinitionData(reader, version) {
    this.rgctxDataDummy = reader.readInt();
    this.methodIndex = this.rgctxDataDummy;
    this.typeIndex = this.rgctxDataDummy;
}

function Il2CppRGCTXDefinition(reader, version) {
    if (version <= 27.1) {
        this.type_pre29 = reader.readInt();
    }
    if (version >= 29) {
        this.type_post29 = reader.readInt(); reader.readInt();
    }
    this.type = Il2CppRGCTXDataType[this.type_post29 === 0 ? this.type_pre29 : this.type_post29];
    if (version <= 27.1) {
        this.data = new Il2CppRGCTXDefinitionData(reader, version);
    }
    if (version >= 27.2) {
        this._data = reader.readInt(); reader.readInt();
    }
}

const Il2CppMetadataUsage = [
    'kIl2CppMetadataUsageInvalid', 
    'kIl2CppMetadataUsageTypeInfo', 
    'kIl2CppMetadataUsageIl2CppType', 
    'kIl2CppMetadataUsageMethodDef', 
    'kIl2CppMetadataUsageFieldInfo', 
    'kIl2CppMetadataUsageStringLiteral', 
    'kIl2CppMetadataUsageMethodRef'
];

function Il2CppCustomAttributeDataRange(reader, version) {
    this.token = reader.readUInt();
    this.startOffset = reader.readUInt();
}