function dump_images(entry) {
    var children = [];
    for (var imageIndex = 0; imageIndex < entry.metadata.imageDefinitions.length; imageIndex++) {
        var imageDefinition = entry.metadata.imageDefinitions[imageIndex];
        entry.content.push(`// Image ${imageIndex}: ${imageDefinition.name} - ${imageDefinition.typeStart}`);
        children.push({
            "type": "image",
            "loaded": false,
            "label": imageDefinition.name,
            "content": [],
            "value": imageDefinition,
            "children": [],
        });
    }
    children.sort(function (a, b) { return a.label > b.label ? 1 : -1; });
    entry.li.addchildren(children);
}

function dump_imagedef(entry) {
    var metadata = entry.li.parentElement.previousSibling.entry.metadata;
    var imageDefinition = entry.value;
    var typeEnd = imageDefinition.typeStart + imageDefinition.typeCount;
    var children = {};
    for (var typeDefIndex = imageDefinition.typeStart; typeDefIndex < typeEnd; typeDefIndex++)
    {
        var typeDef = metadata.typeDefinitions[typeDefIndex];
        var namespace = typeDef.namespace;
        if (namespace === "") {
            namespace = "-";
        }
        if (children[namespace] === undefined) {
            children[namespace] = [];
        }
        children[namespace].push(typeDefIndex);
    }
    children = Object.keys(children).map(entry => ({
        "type": "imagedef",
        "loaded": false,
        "label": entry,
        "content": [],
        "value": children[entry],
        "children": [],
    }));
    children.sort(function (a, b) { return a.label > b.label ? 1 : -1; });
    entry.li.addchildren(children);
}

function dump_imagedef_namespace(entry) {
    var imageDefinitionEntry = entry.li.parentElement.previousSibling.entry;
    var metadata = imageDefinitionEntry.li.parentElement.previousSibling.entry.metadata;
    // var imageDefinition = imageDefinitionEntry.value;
    var children = [];
    for (var typeDefIndex of entry.value)
    {
        var typeDef = metadata.typeDefinitions[typeDefIndex];
        entry.content.push(`// Type ${typeDefIndex}: ${typeDef.name}`);
        children.push({
            "type": "typedef",
            "loaded": false,
            "label": typeDef.name,
            "content": [],
            "value": {
                "index": typeDefIndex,
                "metadata": metadata,
                "typeDef": typeDef,
                "typeDefIndex": typeDefIndex,
                "imageDefinition": imageDefinitionEntry.value
            },
            "children": [],
        });
    }
    children.sort(function (a, b) { return a.label > b.label ? 1 : -1; });
    entry.li.addchildren(children);
}

var FIELD_ATTRIBUTE_FIELD_ACCESS_MASK = 0x0007;
var FIELD_ATTRIBUTE_COMPILER_CONTROLLED = 0x0000;
var FIELD_ATTRIBUTE_PRIVATE = 0x0001;
var FIELD_ATTRIBUTE_FAM_AND_ASSEM = 0x0002;
var FIELD_ATTRIBUTE_ASSEMBLY = 0x0003;
var FIELD_ATTRIBUTE_FAMILY = 0x0004;
var FIELD_ATTRIBUTE_FAM_OR_ASSEM = 0x0005;
var FIELD_ATTRIBUTE_PUBLIC = 0x0006;

var FIELD_ATTRIBUTE_STATIC = 0x0010;
var FIELD_ATTRIBUTE_INIT_ONLY = 0x0020;
var FIELD_ATTRIBUTE_LITERAL = 0x0040;

/*
 * Method Attributes (22.1.9)
 */
var METHOD_ATTRIBUTE_MEMBER_ACCESS_MASK = 0x0007;
var METHOD_ATTRIBUTE_COMPILER_CONTROLLED = 0x0000;
var METHOD_ATTRIBUTE_PRIVATE = 0x0001;
var METHOD_ATTRIBUTE_FAM_AND_ASSEM = 0x0002;
var METHOD_ATTRIBUTE_ASSEM = 0x0003;
var METHOD_ATTRIBUTE_FAMILY = 0x0004;
var METHOD_ATTRIBUTE_FAM_OR_ASSEM = 0x0005;
var METHOD_ATTRIBUTE_PUBLIC = 0x0006;

var METHOD_ATTRIBUTE_STATIC = 0x0010;
var METHOD_ATTRIBUTE_FINAL = 0x0020;
var METHOD_ATTRIBUTE_VIRTUAL = 0x0040;

var METHOD_ATTRIBUTE_VTABLE_LAYOUT_MASK = 0x0100;
var METHOD_ATTRIBUTE_REUSE_SLOT = 0x0000;
var METHOD_ATTRIBUTE_NEW_SLOT = 0x0100;

var METHOD_ATTRIBUTE_ABSTRACT = 0x0400;

var METHOD_ATTRIBUTE_PINVOKE_IMPL = 0x2000;

/*
* Type Attributes (21.1.13).
*/
var TYPE_ATTRIBUTE_VISIBILITY_MASK = 0x00000007;
var TYPE_ATTRIBUTE_NOT_PUBLIC = 0x00000000;
var TYPE_ATTRIBUTE_PUBLIC = 0x00000001;
var TYPE_ATTRIBUTE_NESTED_PUBLIC = 0x00000002;
var TYPE_ATTRIBUTE_NESTED_PRIVATE = 0x00000003;
var TYPE_ATTRIBUTE_NESTED_FAMILY = 0x00000004;
var TYPE_ATTRIBUTE_NESTED_ASSEMBLY = 0x00000005;
var TYPE_ATTRIBUTE_NESTED_FAM_AND_ASSEM = 0x00000006;
var TYPE_ATTRIBUTE_NESTED_FAM_OR_ASSEM = 0x00000007;


var TYPE_ATTRIBUTE_INTERFACE = 0x00000020;

var TYPE_ATTRIBUTE_ABSTRACT = 0x00000080;
var TYPE_ATTRIBUTE_SEALED = 0x00000100;

var TYPE_ATTRIBUTE_SERIALIZABLE = 0x00002000;

/*
* Flags for Params (22.1.12)
*/
var PARAM_ATTRIBUTE_IN = 0x0001;
var PARAM_ATTRIBUTE_OUT = 0x0002;
var PARAM_ATTRIBUTE_OPTIONAL = 0x0010;

function dump_typedef(entry) {
    var typeDefIndex = entry.value.typeDefIndex;
    var typeDef = entry.value.typeDef;
    var extends_ = [];
    var imageDefinition = entry.value.imageDefinition;
    var metadata = entry.value.metadata;
    var config = {
        "DumpAttribute": true,
        "DumpField": true,
        "DumpMethod": true,
        "DumpProperty": true,
        "DumpTypeDefIndex": true
    }
    // var parts = [];
    var parts = document.createElement("pre");
    var writer = {
        // "Write": function(...str) {
        "Write": function(str, color) {
            // console.log(...str);
            // parts.push(str);
            if (color === undefined) {
                parts.appendChild(document.createTextNode(str));
            } else {
                var span = document.createElement("span");
                span.className = "color_" + color;
                span.appendChild(document.createTextNode(str));
                parts.appendChild(span);
            }
        },
        "Close": function() {}
    }
    writer.Write(`\n// Namespace: ${typeDef.namespace}\n`, "comment");
    if (config.DumpAttribute)
    {
        WriteCustomAttribute(writer, imageDefinition, typeDef.customAttributeIndex, typeDef.token);
    }
    if (config.DumpAttribute && (typeDef.flags & TYPE_ATTRIBUTE_SERIALIZABLE) != 0) {
        writer.Write("[");
        writer.Write("Serializable", "class");
        writer.Write("]\n");
    }
    var visibility = typeDef.flags & TYPE_ATTRIBUTE_VISIBILITY_MASK;
    switch (visibility)
    {
        case TYPE_ATTRIBUTE_PUBLIC:
        case TYPE_ATTRIBUTE_NESTED_PUBLIC:
            writer.Write("public ", "keyword");
            break;
        case TYPE_ATTRIBUTE_NOT_PUBLIC:
        case TYPE_ATTRIBUTE_NESTED_FAM_AND_ASSEM:
        case TYPE_ATTRIBUTE_NESTED_ASSEMBLY:
            writer.Write("internal ", "keyword");
            break;
        case TYPE_ATTRIBUTE_NESTED_PRIVATE:
            writer.Write("private ", "keyword");
            break;
        case TYPE_ATTRIBUTE_NESTED_FAMILY:
            writer.Write("protected ", "keyword");
            break;
        case TYPE_ATTRIBUTE_NESTED_FAM_OR_ASSEM:
            writer.Write("protected internal ", "keyword");
            break;
    }
    if ((typeDef.flags & TYPE_ATTRIBUTE_ABSTRACT) != 0 && (typeDef.flags & TYPE_ATTRIBUTE_SEALED) != 0)
        writer.Write("static ", "keyword");
    else if ((typeDef.flags & TYPE_ATTRIBUTE_INTERFACE) == 0 && (typeDef.flags & TYPE_ATTRIBUTE_ABSTRACT) != 0)
        writer.Write("abstract ", "keyword");
    else if (!typeDef.IsValueType && !typeDef.IsEnum && (typeDef.flags & TYPE_ATTRIBUTE_SEALED) != 0)
        writer.Write("sealed ", "keyword");
    if ((typeDef.flags & TYPE_ATTRIBUTE_INTERFACE) != 0)
        writer.Write("interface ", "keyword");
    else if (typeDef.IsEnum)
        writer.Write("enum ", "keyword");
    else if (typeDef.IsValueType)
        writer.Write("struct ", "keyword");
    else
        writer.Write("class ", "keyword");
    var typeName = `executor.GetTypeDefName(${typeDef}, false, true)`;
    typeName = typeDef.name; // test
    writer.Write(`${typeName}`);
    if (extends_.Count > 0)
        writer.Write(` : ${extends_.join(", ")}`);
    if (config.DumpTypeDefIndex) {
        writer.Write(` // TypeDefIndex: ${typeDefIndex}`, "comment");
        writer.Write(`\n{`);
    } else
        writer.Write("\n{");
    //dump field
    if (config.DumpField && typeDef.field_count > 0)
    {
        writer.Write("\n\t// Fields\n", "comment");
        var fieldEnd = typeDef.fieldStart + typeDef.field_count;
        for (var i = typeDef.fieldStart; i < fieldEnd; ++i)
        {
            var fieldDef = metadata.fieldDefinitions[i];
            // var fieldType = `types[${fieldDef.typeIndex}]`;
            var isStatic = false;
            var isConst = false;
            if (config.DumpAttribute)
            {
                WriteCustomAttribute(writer, imageDefinition, fieldDef.customAttributeIndex, fieldDef.token, "\t");
            }
            writer.Write("\t");
            // var access = fieldType.attrs & FIELD_ATTRIBUTE_FIELD_ACCESS_MASK;
            // switch (access)
            // {
            //     case FIELD_ATTRIBUTE_PRIVATE:
            //         writer.Write("private ");
            //         break;
            //     case FIELD_ATTRIBUTE_PUBLIC:
            //         writer.Write("public ");
            //         break;
            //     case FIELD_ATTRIBUTE_FAMILY:
            //         writer.Write("protected ");
            //         break;
            //     case FIELD_ATTRIBUTE_ASSEMBLY:
            //     case FIELD_ATTRIBUTE_FAM_AND_ASSEM:
            //         writer.Write("internal ");
            //         break;
            //     case FIELD_ATTRIBUTE_FAM_OR_ASSEM:
            //         writer.Write("protected internal ");
            //         break;
            // }
            // if ((fieldType.attrs & FIELD_ATTRIBUTE_LITERAL) != 0)
            // {
            //     isConst = true;
            //     writer.Write("const ");
            // }
            // else
            // {
            //     if ((fieldType.attrs & FIELD_ATTRIBUTE_STATIC) != 0)
            //     {
            //         isStatic = true;
            //         writer.Write("static ");
            //     }
            //     if ((fieldType.attrs & FIELD_ATTRIBUTE_INIT_ONLY) != 0)
            //     {
            //         writer.Write("readonly ");
            //     }
            // }
            WriteFieldName(writer, metadata, fieldDef.typeIndex);
            writer.Write(" ");
            writer.Write(fieldDef.name);
            // if (metadata.GetFieldDefaultValueFromIndex(i, fieldDefaultValue) && fieldDefaultValue.dataIndex != -1)
            if ((fieldDefaultValue = metadata.fieldDefaultValues[i]) && fieldDefaultValue.dataIndex != -1)
            {
                // if (executor.TryGetDefaultValue(fieldDefaultValue.typeIndex, fieldDefaultValue.dataIndex, value))
                // {
                //     writer.Write(` = `);
                //     if (value is string str)
                //     {
                //         writer.Write(`\"${str.ToEscapedString()}\"`);
                //     }
                //     else if (value is char c)
                //     {
                //         var v = (int)c;
                //         writer.Write(`'\\x${v:x}'`);
                //     }
                //     else if (value != null)
                //     {
                //         writer.Write(`${value}`);
                //     }
                //     else
                //     {
                //         writer.Write("null");
                //     }
                // }
                // else
                // {
                    writer.Write(` /*Metadata offset 0x{value:X}*/`, "comment");
                // }
            }
            if (config.DumpFieldOffset && !isConst)
                writer.Write(`; // 0x{il2Cpp.GetFieldOffsetFromIndex(${typeDefIndex}, ${i - typeDef.fieldStart}, ${i}, ${typeDef.IsValueType}, ${isStatic})}\n`, "comment");
            else
                writer.Write(";\n");
        }
    }
    //dump property
    if (config.DumpProperty && typeDef.property_count > 0)
    {
        writer.Write("\n\t// Properties\n", "comment");
        var propertyEnd = typeDef.propertyStart + typeDef.property_count;
        for (var i = typeDef.propertyStart; i < propertyEnd; ++i)
        {
            var propertyDef = metadata.propertyDefinitions[i];
            if (config.DumpAttribute)
            {
                WriteCustomAttribute(writer, imageDefinition, propertyDef.customAttributeIndex, propertyDef.token, "\t");
            }
            writer.Write("\t");
            if (propertyDef.get >= 0)
            {
                var methodDef = metadata.methodDefinitions[typeDef.methodStart + propertyDef.get];
                WriteModifiers(writer, methodDef);
                // var propertyTypeDef = undefined; // metadata.typeDefinitions[methodDef.returnType];
                // var propertyType = propertyTypeDef ? propertyTypeDef.name : `il2Cpp.types[${methodDef.returnType}]`;
                WriteTypeName(writer, metadata, methodDef.returnType);
                writer.Write(" ");
                writer.Write(propertyDef.name);
                writer.Write(" { ");
            }
            else if (propertyDef.set >= 0)
            {
                var methodDef = metadata.methodDefinitions[typeDef.methodStart + propertyDef.set];
                WriteModifiers(writer, methodDef);
                var parameterDef = metadata.parameterDefinitions[methodDef.parameterStart];
                // var propertyTypeDef = undefined; // metadata.typeDefinitions[parameterDef.typeIndex];
                // var propertyType = propertyTypeDef ? propertyTypeDef.name : `il2Cpp.types[${parameterDef.typeIndex}]`;
                WriteTypeName(writer, metadata, parameterDef.typeIndex);
                writer.Write(" ");
                writer.Write(propertyDef.name);
                writer.Write(" { ");
            }
            if (propertyDef.get >= 0) {
                writer.Write("get", "keyword");
                writer.Write("; ");
            }
            if (propertyDef.set >= 0) {
                writer.Write("set", "keyword");
                writer.Write("; ");
            }
            writer.Write("}");
            writer.Write("\n");
        }
    }
    //dump method
    if (config.DumpMethod && typeDef.method_count > 0)
    {
        writer.Write("\n\t// Methods\n", "comment");
        var methodEnd = typeDef.methodStart + typeDef.method_count;
        for (var i = typeDef.methodStart; i < methodEnd; ++i)
        {
            writer.Write("\n");
            var methodDef = metadata.methodDefinitions[i];
            var isAbstract = (methodDef.flags & METHOD_ATTRIBUTE_ABSTRACT) != 0;
            if (config.DumpAttribute)
            {
                WriteCustomAttribute(writer, imageDefinition, methodDef.customAttributeIndex, methodDef.token, "\t");
            }
            // if (config.DumpMethodOffset)
            // {
            //     var methodPointer = il2Cpp.GetMethodPointer(imageName, methodDef);
            //     if (!isAbstract && methodPointer > 0)
            //     {
            //         var fixedMethodPointer = il2Cpp.GetRVA(methodPointer);
            //         writer.Write("\t// RVA: 0x{0:X} Offset: 0x{1:X} VA: 0x{2:X}", fixedMethodPointer, il2Cpp.MapVATR(methodPointer), methodPointer);
            //     }
            //     else
            //     {
            //         writer.Write("\t// RVA: -1 Offset: -1");
            //     }
            //     if (methodDef.slot != ushort.MaxValue)
            //     {
            //         writer.Write(" Slot: {0}", methodDef.slot);
            //     }
            //     writer.Write("\n");
            // }
            writer.Write("\t");
            WriteModifiers(writer, methodDef);
            // var methodReturnType = `il2Cpp.types[${methodDef.returnType}]`;
            var methodName = methodDef.name;
            if (methodDef.genericContainerIndex >= 0)
            {
                var genericContainer = metadata.genericContainers[methodDef.genericContainerIndex];
                methodName += `executor.GetGenericContainerParams(${genericContainer})`;
            }
            // if (methodReturnType.byref == 1)
            // {
            //     writer.Write("ref ");
            // }
            WriteTypeName(writer, metadata, methodDef.returnType);
            writer.Write(" ");
            writer.Write(methodName, "function");
            writer.Write("(");
            // var parameterStrs = [];
            for (var j = 0; j < methodDef.parameterCount; ++j)
            {
                if (j > 0) {
                    writer.Write(", ");
                }
                // var parameterStr = "";
                var parameterDef = metadata.parameterDefinitions[methodDef.parameterStart + j];
                // var parameterName = parameterDef.name;
                // var parameterType = `il2Cpp.types[${parameterDef.typeIndex}]`;
                // var parameterTypeName = `${GetTypeName(metadata, parameterDef.typeIndex)}`;
                WriteTypeName(writer, metadata, parameterDef.typeIndex);
                // if (parameterType.byref == 1)
                // {
                //     if ((parameterType.attrs & PARAM_ATTRIBUTE_OUT) != 0 && (parameterType.attrs & PARAM_ATTRIBUTE_IN) == 0)
                //     {
                //         parameterStr += "out ";
                //     }
                //     else if ((parameterType.attrs & PARAM_ATTRIBUTE_OUT) == 0 && (parameterType.attrs & PARAM_ATTRIBUTE_IN) != 0)
                //     {
                //         parameterStr += "in ";
                //     }
                //     else
                //     {
                //         parameterStr += "ref ";
                //     }
                // }
                // else
                // {
                //     if ((parameterType.attrs & PARAM_ATTRIBUTE_IN) != 0)
                //     {
                //         parameterStr += "[In] ";
                //     }
                //     if ((parameterType.attrs & PARAM_ATTRIBUTE_OUT) != 0)
                //     {
                //         parameterStr += "[Out] ";
                //     }
                // }
                // parameterStr += `${parameterTypeName} ${parameterName}`;
                writer.Write(" ");
                writer.Write(parameterDef.name);
                if ((parameterDefault = metadata.parameterDefaultValues[methodDef.parameterStart + j]) && parameterDefault && parameterDefault.dataIndex != -1)
                {
                    var value = `executor.TryGetDefaultValue(${parameterDefault.typeIndex}, ${parameterDefault.dataIndex}, ${value})`;
                    // if (executor.TryGetDefaultValue(parameterDefault.typeIndex, parameterDefault.dataIndex, value))
                    // {
                    //     parameterStr += " = ";
                    //     if (value is string str)
                    //     {
                    //         parameterStr += `\"${str.ToEscapedString()}\"`;
                    //     }
                    //     else if (value is char c)
                    //     {
                    //         var v = (int)c;
                    //         parameterStr += `'\\x${v:x}'`;
                    //     }
                    //     else if (value != null)
                    //     {
                    //         parameterStr += `{value}`;
                    //     }
                    //     else
                    //     {
                    //         writer.Write("null");
                    //     }
                    // }
                    // else
                    // {
                        // parameterStr += ` /*Metadata offset 0x${value.toString(16)}*/`;
                        writer.Write(` /*Metadata offset 0x${value.toString(16)}*/`, "comment")
                    // }
                }
                // parameterStrs.push(parameterStr);
            }
            // writer.Write(parameterStrs.join(", "));
            if (isAbstract)
            {
                writer.Write(");\n");
            }
            else
            {
                writer.Write(") { }\n");
            }

            // if (il2Cpp.methodDefinitionMethodSpecs.TryGetValue(i, methodSpecs))
            // {
            //     writer.Write("\t/* GenericInstMethod :\n");
            //     var groups = methodSpecs.GroupBy(x => il2Cpp.methodSpecGenericMethodPointers[x]);
            //     for (var group of groups)
            //     {
            //         writer.Write("\t|\n");
            //         var genericMethodPointer = group.Key;
            //         if (genericMethodPointer > 0)
            //         {
            //             var fixedPointer = il2Cpp.GetRVA(genericMethodPointer);
            //             writer.Write(`\t|-RVA: 0x{fixedPointer:X} Offset: 0x{il2Cpp.MapVATR(genericMethodPointer):X} VA: 0x{genericMethodPointer:X}\n`);
            //         }
            //         else
            //         {
            //             writer.Write("\t|-RVA: -1 Offset: -1\n");
            //         }
            //         for (var methodSpec of group)
            //         {
            //             // var (methodSpecTypeName, methodSpecMethodName) = executor.GetMethodSpecName(methodSpec);
            //             writer.Write(`\t|-{methodSpec}\n`);
            //         }
            //     }
            //     writer.Write("\t*/\n");
            // }
        }
    }
    writer.Write("}\n");
    // entry.content = parts.join("");
    // entry.parse_mode = "text";
    entry.content = parts.innerHTML;
    entry.parse_mode = "html";
}

function WriteModifiers(writer, methodDef)
{
    // if (methodModifiers.TryGetValue(methodDef, out string str))
    //     return str;
    // var str = "";
    var access = methodDef.flags & METHOD_ATTRIBUTE_MEMBER_ACCESS_MASK;
    switch (access)
    {
        case METHOD_ATTRIBUTE_PRIVATE:
            writer.Write("private ", "keyword");
            break;
        case METHOD_ATTRIBUTE_PUBLIC:
            writer.Write("public ", "keyword");
            break;
        case METHOD_ATTRIBUTE_FAMILY:
            writer.Write("protected ", "keyword");
            break;
        case METHOD_ATTRIBUTE_ASSEM:
        case METHOD_ATTRIBUTE_FAM_AND_ASSEM:
            writer.Write("internal ", "keyword");
            break;
        case METHOD_ATTRIBUTE_FAM_OR_ASSEM:
            writer.Write("protected internal ", "keyword");
            break;
    }
    if ((methodDef.flags & METHOD_ATTRIBUTE_STATIC) != 0)
        writer.Write("static ", "keyword");
    if ((methodDef.flags & METHOD_ATTRIBUTE_ABSTRACT) != 0)
    {
        writer.Write("abstract ", "keyword");
        if ((methodDef.flags & METHOD_ATTRIBUTE_VTABLE_LAYOUT_MASK) == METHOD_ATTRIBUTE_REUSE_SLOT)
            writer.Write("override ", "keyword");
    }
    else if ((methodDef.flags & METHOD_ATTRIBUTE_FINAL) != 0)
    {
        if ((methodDef.flags & METHOD_ATTRIBUTE_VTABLE_LAYOUT_MASK) == METHOD_ATTRIBUTE_REUSE_SLOT)
            writer.Write("sealed override ", "keyword");
    }
    else if ((methodDef.flags & METHOD_ATTRIBUTE_VIRTUAL) != 0)
    {
        if ((methodDef.flags & METHOD_ATTRIBUTE_VTABLE_LAYOUT_MASK) == METHOD_ATTRIBUTE_NEW_SLOT)
            writer.Write("virtual ", "keyword");
        else
            writer.Write("override ", "keyword");
    }
    if ((methodDef.flags & METHOD_ATTRIBUTE_PINVOKE_IMPL) != 0)
        writer.Write("extern ", "keyword");
    // methodModifiers.Add(methodDef, str);
    // return str;
}

function ResolveSlice(metadata, content) {
    var ReadCustomAttributeNamedArgumentClassAndIndex = function (typeDef) {
        var memberIndex = read_compressed_uint32(reader);
        if (memberIndex >= 0) return [typeDef, memberIndex];
        memberIndex = -(memberIndex + 1);
        var typeIndex = read_compressed_uint32(reader);
        var declaringClass = metadata.typeDefinitions[typeIndex];
        return [declaringClass, memberIndex];
    }
    var ReadEncodedTypeEnum = function () {
        var type = reader.readByte();
        if (type == 0x55) { // IL2CPP_TYPE_ENUM
            var enumTypeIndex = read_compressed_uint32(reader);
            return `il2Cpp.types[${enumTypeIndex}]`;
        } else {
            return type;
        }
    }
    var GetConstantValueFromBlob = function (type) {
        if (type == 0x02) { // IL2CPP_TYPE_BOOLEAN
            return reader.readByte() == 1;
        } else if (type == 0x05) { // IL2CPP_TYPE_U1
            return reader.readByte();
        } else if (type == 0x04) { // IL2CPP_TYPE_I1
            var temp = reader.readByte();
            return temp > 127 ? temp - 256 : temp;
        } else if (type == 0x02) { // IL2CPP_TYPE_CHAR
            return reader.readBytes(2);
        } else if (type == 0x07) { // IL2CPP_TYPE_U2
            return reader.readUShort();
        } else if (type == 0x06) { // IL2CPP_TYPE_I2
            return reader.readShort();
        } else if (type == 0x09) { // IL2CPP_TYPE_U4
            if (metadata.header.version >= 29) {
                return read_compressed_uint32(reader);
            } else {
                return reader.readUInt();
            }
        } else if (type == 0x08) { // IL2CPP_TYPE_I4
            if (metadata.header.version >= 29) {
                return read_compressed_int32(reader);
            } else {
                return reader.readInt();
            }
        } else if (type == 0x0B) { // IL2CPP_TYPE_U8
            return reader.readULong();
        } else if (type == 0x0A) { // IL2CPP_TYPE_I8
            return reader.readLong();
        } else if (type == 0x0C) { // IL2CPP_TYPE_R4
            return reader.readSingle();
        } else if (type == 0x0D) { // IL2CPP_TYPE_R8
            return reader.readDouble();
        } else if (type == 0x0E) { // IL2CPP_TYPE_STRING
            var length;
            if (metadata.header.version >= 29) {
                length = read_compressed_int32(reader);
                if (length === -1) {
                    return null;
                } else {
                    return reader.readString(length);
                }
            } else {
                length = reader.readInt();
                return reader.readString(length);
            }
        } else if (type == 0x1D) { // IL2CPP_TYPE_SZARRAY
            var arrayLen = read_compressed_int32(reader);
            if (arrayLen === -1) {
                return null;
            } else {
                var array = [];
                var arrayElementType = ReadEncodedTypeEnum();
                var arrayElementsAreDifferent = reader.readByte();
                for (var i = 0; i < arrayLen; i++) {
                    var elementType = arrayElementType;
                    if (arrayElementsAreDifferent == 1) {
                        elementType = ReadEncodedTypeEnum();
                    }
                    var elementValue = GetConstantValueFromBlob(elementType);
                    array.push(elementValue);
                }
                return array;
            }
        } else if (type == 0xFF) { // IL2CPP_TYPE_IL2CPP_TYPE_INDEX
            var typeIndex = read_compressed_int32(reader);
            if (typeIndex === -1) {
                return null;
            } else {
                return `il2Cpp.types[${typeIndex}]`;
            }
        } else {
            return null;
        }
        // GetConstantValueFromBlob
    }
    var ReadAttributeDataValue = function () {
        var type = ReadEncodedTypeEnum();
        return GetConstantValueFromBlob(type);
    }
    var reader = new LittleEndianReader(content);
    var count = read_compressed_uint32(reader);
    var ctorIndices = [];
    var attributes = [];
    for (var j = 0; j < count; j++) {
        ctorIndices.push(reader.readInt());
    }
    for (var j = 0; j < count; j++) {
        var typeDef = metadata.typeDefinitions[metadata.methodDefinitions[ctorIndices[j]].declaringType];
        var argumentCount = read_compressed_uint32(reader);
        var fieldCount = read_compressed_uint32(reader);
        var propertyCount = read_compressed_uint32(reader);
        var arguments = [];
        for (var i = 0; i < argumentCount; i++) {
            arguments.push([ReadAttributeDataValue()]);
        }
        // var fields = [];
        for (var i = 0; i < fieldCount; i++) {
            var temp = ReadAttributeDataValue();
            var [declaring, fieldIndex] = ReadCustomAttributeNamedArgumentClassAndIndex(typeDef);
            var fieldDef = metadata.fieldDefinitions[declaring.fieldStart + fieldIndex];
            // fields.push([
            arguments.push([
                fieldDef.name,
                temp
            ]);
        }
        var properties = [];
        for (var i = 0; i < propertyCount; i++) {
            var temp = ReadAttributeDataValue();
            var [declaring, propertyIndex] = ReadCustomAttributeNamedArgumentClassAndIndex(typeDef);
            var propertyDef = metadata.propertyDefs[declaring.propertyStart + propertyIndex];
            // fields.push([
            arguments.push([
                propertyDef.name,
                temp
            ]);
        }
        attributes.push({
            ctorIndex: ctorIndices[j],
            typeDef: typeDef,
            arguments: arguments,
            // fields: fields,
            properties: properties
        });
    }
    return attributes;
}

function AttributeDataToString(blobValue)
{
    //TODO enum
    if (blobValue === null) {
        return [["null", "const"]];
    }
    if (typeof blobValue === "string") {
        return [[JSON.stringify(blobValue), "string"]];
    } else if (Array.isArray(blobValue)) {
        var temp = [
            ["new", "keyword"],
            ["[] { "],
        ];
        blobValue.forEach(function (entry) {
           temp.push(...AttributeDataToString(entry));
           temp.push([", "]); 
        });
        temp.pop();
        temp.push([" }"]);
        // return `new[] { ${blobValue.map(AttributeDataToString).join(", ")} }`;
        return temp;
    }
    return [[blobValue, "const"]];
}


function ResolveSliceAsString(metadata, content) {
    var result = ResolveSlice(metadata, content);
    var all_entries = [];
    result.forEach(entry => {
        var entries = [];
        var typeName = entry.typeDef.name;
        if (typeName.endsWith("Attribute")) {
            typeName = typeName.substr(0, typeName.length - "Attribute".length);
        }
        if (entry.arguments.length === 0) {
            entries.push(["["]);
            entries.push([typeName, "class"]);
            entries.push(["]"]);
        } else {
            entries.push(["["]);
            entries.push([typeName, "class"]);
            entries.push(["("]);
            entry.arguments.forEach(function (arg) {
                if (arg.length === 1) {
                    entries.push(...AttributeDataToString(arg[0]));
                } else {
                    // 2
                    entries.push([`${arg[0]} = ${arg[1]}`]);
                }
                entries.push([", "]);
            });
            entries.pop();
            // entries.push([entry.arguments.map(function (arg) {
            //     if (arg.length === 1) {
            //         return AttributeDataToString(arg[0]);
            //     } else {
            //         // 2
            //         return `${arg[0]} = ${arg[1]}`;
            //     }
            // }).join(", ")]);
            entries.push([")]"]);
        }
        all_entries.push(entries);
    })
    return all_entries;
}

function WriteTypeName(writer, metadata, typeIndex) {
    var temp = metadata.knownTypes[typeIndex];
    if (temp === undefined) {
        writer.Write(`il2Cpp.types[${typeIndex}]`, "class");
    } else {
        if (temp[1]) { // keyword type
            writer.Write(temp[0], "keyword");
        } else {
            writer.Write(temp[0], "class");
        }
    }
}

function WriteFieldName(writer, metadata, typeIndex) {
    var temp = metadata.knownFields[typeIndex];
    if (temp === undefined) {
        writer.Write(`il2Cpp.types[${typeIndex}]`, "class");
    } else {
        writer.Write(temp[0], "keyword");
        writer.Write(" ");
        if (temp[2]) { // keyword type
            writer.Write(temp[1], "keyword");
        } else {
            writer.Write(temp[1], "class");
        }
    }
}

function WriteCustomAttribute(writer, /*Il2CppImageDefinition*/ imageDef, /*int*/ customAttributeIndex, /*uint*/ token, /*string*/ padding = "")
{
    if (metadata.header.version < 21)
        return "";
    // var attributeIndex = metadata.GetCustomAttributeIndex(imageDef, customAttributeIndex, token);
    var attributeIndex;
    if (metadata.header.version > 24) {
        attributeIndex = metadata.attributeTypeRangesDict[imageDef.nameIndex][token];
        if (attributeIndex === undefined) {
            attributeIndex = -1;
        }
    } else {
        attributeIndex = customAttributeIndex;
    }

    if (attributeIndex >= 0)
    {
        if (metadata.header.version < 29)
        {
            var methodPointer = executor.customAttributeGenerators[attributeIndex];
            // var fixedMethodPointer = `il2Cpp.GetRVA(${methodPointer})`;
            var attributeTypeRange = metadata.attributeTypeRanges[attributeIndex];
            // var sb = [];
            for (var i = 0; i < attributeTypeRange.count; i++)
            {
                var typeIndex = metadata.attributeTypes[attributeTypeRange.start + i];
                writer.Write(padding);
                writer.Write('[');
                WriteTypeName(writer, metadata, typeIndex);
                writer.Write(']');
                // sb.push(`${padding}[${GetTypeName(metadata, typeIndex)}]`);
            }
            // return sb.join("");
        }
        else
        {
            var dataSlice = ResolveSliceAsString(metadata, metadata.attributeDataSlice[attributeIndex]);
            // var startRange = metadata.attributeDataRanges[attributeIndex];
            // var endRange = metadata.attributeDataRanges[attributeIndex + 1];
            // metadata.Position = metadata.header.attributeDataOffset + startRange.startOffset;
            // var buff = metadata.ReadBytes((int)(endRange.startOffset - startRange.startOffset));
            // var reader = new CustomAttributeDataReader(executor, buff);
            // if (reader.Count == 0)
            // {
            //     return "";
            // }
            // var sb = [];
            for (var i = 0; i < dataSlice.length; i++)
            {
                writer.Write(padding);
                // sb.push(reader.GetStringCustomAttributeData());
                dataSlice[i].forEach(function (entry) {
                    if (entry.length === 2) {
                        writer.Write(entry[0], entry[1]);
                    } else {
                        writer.Write(entry[0]);
                    }
                })
                // writer.Write(dataSlice[i]);
                writer.Write('\n');
            }
            // return sb.join("");
        }
    }
    else
    {
        return "";
    }
}