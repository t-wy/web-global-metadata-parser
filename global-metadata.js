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
    var resolve_name = function(cls) {
        reader.seek(_this.header.stringOffset + cls.nameIndex);
        cls.name = reader.readNullString();
        if (cls.namespaceIndex) {
            reader.seek(_this.header.stringOffset + cls.namespaceIndex);
            cls.namespace = reader.readNullString();
        }
    }
    var read_class_array = function(reader, offset, size, cls) {
        var result = [];
        reader.seek(offset);
        while (reader.tell() < offset + size) {
            result.push(new cls(reader, _this.header.version));
        }
        reader.seek(offset + size); // safe guard
        return result;
    }
    this.header = new MetadataHeader(reader);
    if (this.header.sanity !== 0xFAB11BAF) {
        throw Error("Magic number not match.");
    }
    if (this.header.version < 16 || this.header.version > 31) {
        throw Error("Metadata version not supported.");
    }
    // Differentiate version 24
    if (this.header.version === 24) {
        if (header.stringLiteralOffset === 264) {
            // exclude rgctxEntries
            reader.seek(0);
            this.header = new MetadataHeader(reader, 24.2);
        } else {
            this.imageDefinitions = read_class_array(reader, this.header.imagesOffset, this.header.imagesSize, Il2CppImageDefinition);
            if (this.imageDefinitions.some(entry => entry.token !== 1)) {
                this.header.version = 24.1;
            }
        }
    }
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
    this.assemblyDefs = read_class_array(reader, this.header.assembliesOffset, this.header.assembliesSize, AssemblyDefinition);
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

    this.knownTypes = {};
    // window.metadata = this;
    // try resolve common types
    for (var temp of this.typeDefinitions) {
        if (temp.namespace === "UnityEngine.UI") {
            if (temp.name === "Text") {
                for (var i = temp.propertyStart; i < temp.propertyStart + temp.property_count; ++i) {
                    var prop = this.propertyDefinitions[i];
                    var typeIndex = null;
                    if (prop.get >= 0) {
                        typeIndex = this.methodDefinitions[temp.methodStart + prop.get].returnType;
                    } else if (prop.set >= 0) {
                        typeIndex = this.parameterDefinitions[this.methodDefinitions[temp.methodStart + prop.set].parameterStart].typeIndex;
                    }
                    if (prop.name === "text") {
                        this.knownTypes[typeIndex] = "string";
                    } else if (prop.name === "fontSize") {
                        this.knownTypes[typeIndex] = "int";
                    } else if (prop.name === "supportRichText") {
                        this.knownTypes[typeIndex] = "bool";
                    } else if (prop.name === "lineSpacing") {
                        this.knownTypes[typeIndex] = "float";
                    }
                }
            }
        } else if (temp.namespace === "System") {

        }
    }

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
    for (var stringLiteral of this.stringLiterals) {
        reader.seek(this.header.stringLiteralDataOffset + stringLiteral.dataIndex);
        stringLiteral.value = read_string(reader, stringLiteral.length);
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
}

function MetadataHeader(reader, version) {
    this.sanity = reader.readUInt()
    this.version = reader.readInt()
    this.stringLiteralOffset = reader.readUInt() // string data for managed code
    this.stringLiteralSize = reader.readInt()
    this.stringLiteralDataOffset = reader.readUInt()
    this.stringLiteralDataSize = reader.readInt()
    this.stringOffset = reader.readUInt() // string data for metadata
    this.stringSize = reader.readInt()
    this.eventsOffset = reader.readUInt() // Il2CppEventDefinition
    this.eventsSize = reader.readInt()
    this.propertiesOffset = reader.readUInt() // Il2CppPropertyDefinition
    this.propertiesSize = reader.readInt()
    this.methodsOffset = reader.readUInt() // Il2CppMethodDefinition
    this.methodsSize = reader.readInt()
    this.parameterDefaultValuesOffset = reader.readUInt() // Il2CppParameterDefaultValue
    this.parameterDefaultValuesSize = reader.readInt()
    this.fieldDefaultValuesOffset = reader.readUInt() // Il2CppFieldDefaultValue
    this.fieldDefaultValuesSize = reader.readInt()
    this.fieldAndParameterDefaultValueDataOffset = reader.readUInt() // uint8_t
    this.fieldAndParameterDefaultValueDataSize = reader.readInt()
    this.fieldMarshaledSizesOffset = reader.readInt() // Il2CppFieldMarshaledSize
    this.fieldMarshaledSizesSize = reader.readInt()
    this.parametersOffset = reader.readUInt() // Il2CppParameterDefinition
    this.parametersSize = reader.readInt()
    this.fieldsOffset = reader.readUInt() // Il2CppFieldDefinition
    this.fieldsSize = reader.readInt()
    this.genericParametersOffset = reader.readUInt() // Il2CppGenericParameter
    this.genericParametersSize = reader.readInt()
    this.genericParameterConstraintsOffset = reader.readUInt() // TypeIndex
    this.genericParameterConstraintsSize = reader.readInt()
    this.genericContainersOffset = reader.readUInt() // Il2CppGenericContainer
    this.genericContainersSize = reader.readInt()
    this.nestedTypesOffset = reader.readUInt() // Il2CppTypeDefinitionIndex
    this.nestedTypesSize = reader.readInt()
    this.interfacesOffset = reader.readUInt() // TypeIndex
    this.interfacesSize = reader.readInt()
    this.vtableMethodsOffset = reader.readUInt() // EncodedMethodIndex
    this.vtableMethodsSize = reader.readInt()
    this.interfaceOffsetsOffset = reader.readInt() // Il2CppInterfaceOffsetPair
    this.interfaceOffsetsSize = reader.readInt()
    this.typeDefinitionsOffset = reader.readUInt() // Il2CppIl2CppTypeDefinition
    this.typeDefinitionsSize = reader.readInt()
    if (version !== undefined) {
        this.version = version
    }
    if (this.version <= 24.1) {
        this.rgctxEntriesOffset = reader.readUInt() // Il2CppRGCTXDefinition
        this.rgctxEntriesCount = reader.readInt()
    }
    this.imagesOffset = reader.readUInt() // Il2CppImageDefinition
    this.imagesSize = reader.readInt()
    this.assembliesOffset = reader.readUInt() // Il2CppAssemblyDefinition
    this.assembliesSize = reader.readInt()
    if (19 <= this.version && this.version <= 24.5) {
        this.metadataUsageListsOffset = reader.readUInt() // Il2CppMetadataUsageList
        this.metadataUsageListsCount = reader.readInt()
        this.metadataUsagePairsOffset = reader.readUInt() // Il2CppMetadataUsagePair
        this.metadataUsagePairsCount = reader.readInt()
    }
    if (19 <= this.version) {
        this.fieldRefsOffset = reader.readUInt() // Il2CppFieldRef
        this.fieldRefsSize = reader.readInt()
    }
    if (20 <= this.version) {
        this.referencedAssembliesOffset = reader.readInt() // int32_t
        this.referencedAssembliesSize = reader.readInt()
    }
    if (21 <= this.version && this.version <= 27.2) {
        this.attributesInfoOffset = reader.readUInt() // Il2CppCustomAttributeTypeRange
        this.attributesInfoCount = reader.readInt()
        this.attributeTypesOffset = reader.readUInt() // TypeIndex
        this.attributeTypesCount = reader.readInt()
    }
    if (29 <= this.version) {
        this.attributeDataOffset = reader.readUInt()
        this.attributeDataSize = reader.readInt()
        this.attributeDataRangeOffset = reader.readUInt()
        this.attributeDataRangeSize = reader.readInt()
    }
    if (22 <= this.version) {
        this.unresolvedVirtualCallParameterTypesOffset = reader.readInt() // TypeIndex
        this.unresolvedVirtualCallParameterTypesSize = reader.readInt()
        this.unresolvedVirtualCallParameterRangesOffset = reader.readInt() // Il2CppRange
        this.unresolvedVirtualCallParameterRangesSize = reader.readInt()
    }
    if (23 <= this.version) {
        this.windowsRuntimeTypeNamesOffset = reader.readInt() // Il2CppWindowsRuntimeTypeNamePair
        this.windowsRuntimeTypeNamesSize = reader.readInt()
    }
    if (27 <= this.version) {
        this.windowsRuntimeStringsOffset = reader.readInt() // const char*
        this.windowsRuntimeStringsSize = reader.readInt()
    }
    if (24 <= this.version) {
        this.exportedIl2CppTypeDefinitionsOffset = reader.readInt() // Il2CppTypeDefinitionIndex
        this.exportedIl2CppTypeDefinitionsSize = reader.readInt()
    }
}
function AssemblyDefinition(reader, version) {
    this.imageIndex = reader.readInt();
    if (version >= 24.1) {
        this.token = reader.readUInt();
    }
    if (version <= 24) {
        this.customAttributeIndex = reader.readInt();
    }
    if (version >= 20) {
        this.referencedAssemblyStart = reader.readInt();
        this.referencedAssemblyCount = reader.readInt();
    }
    this.aname = new AssemblyNameDefinition(reader, version);
}
function AssemblyNameDefinition(reader, version) {
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
function Il2CppImageDefinition(reader, version) {
    this.nameIndex = reader.readUInt();
    this.assemblyIndex = reader.readInt();
    this.typeStart = reader.readInt();
    this.typeCount = reader.readUInt();
    if (version >= 24) {
        this.exportedTypeStart = reader.readInt();
        this.exportedTypeCount = reader.readUInt();
    }
    this.entryPointIndex = reader.readInt();
    if (version >= 19) {
        this.token = reader.readUInt();
    }
    if (version >= 24.1) {
        this.customAttributeStart = reader.readInt();
        this.customAttributeCount = reader.readUInt();
    }
}
function Il2CppTypeDefinition(reader, version) {
    
    this.nameIndex = reader.readUInt();
    this.namespaceIndex = reader.readUInt();
    if (version <= 24) {
        this.customAttributeIndex = reader.readInt();
    }
    this.byvalTypeIndex = reader.readInt();
    if (version <= 24.5) {
        this.byrefTypeIndex = reader.readInt();
    }
    this.declaringTypeIndex = reader.readInt();
    this.parentIndex = reader.readInt();
    this.elementTypeIndex = reader.readInt(); // we can probably remove this one. Only used for enums
    if (version <= 24.1) {
        this.rgctxStartIndex = reader.readInt();
        this.rgctxCount = reader.readInt();
    }
    this.genericContainerIndex = reader.readInt();
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

function Il2CppMethodDefinition(reader, version) {
    this.nameIndex = reader.readUInt();
    this.declaringType = reader.readInt();
    this.returnType = reader.readInt();
    this.parameterStart = reader.readInt();
    if (version <= 24) {
        this.customAttributeIndex = reader.readInt();
    }
    this.genericContainerIndex = reader.readInt();
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

function Il2CppParameterDefinition(reader, version) {
    this.nameIndex = reader.readUInt();
    this.token = reader.readUInt();
    if (version <= 24) {
        this.customAttributeIndex = reader.readInt();
    }
    this.typeIndex = reader.readInt();
}

function Il2CppFieldDefinition(reader, version) {
    this.nameIndex = reader.readUInt();
    this.typeIndex = reader.readInt();
    if (version <= 24) {
        this.customAttributeIndex = reader.readInt();
    }
    if (version >= 19) {
        this.token = reader.readUInt();
    }
}

function Il2CppFieldDefaultValue(reader, version) {
    this.fieldIndex = reader.readInt();
    this.typeIndex = reader.readInt();
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
    this.length = reader.readUInt();
    this.dataIndex = reader.readInt();
}

function Il2CppParameterDefaultValue(reader, version) {
    this.parameterIndex = reader.readInt();
    this.typeIndex = reader.readInt();
    this.dataIndex = reader.readInt();
}

function Il2CppEventDefinition(reader, version) {
    this.nameIndex = reader.readUInt();
    this.typeIndex = reader.readInt();
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

function Il2CppFieldRef(reader, version) {
    this.typeIndex = reader.readInt();
    this.fieldIndex = reader.readInt(); // local offset into type fields
}

function Il2CppGenericParameter(reader, version) {
    this.ownerIndex = reader.readInt();  /* Type or method this parameter was defined in. */
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

function RGCTXDefinitionData(reader, version) {
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
        this.data = new RGCTXDefinitionData(reader, version);
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