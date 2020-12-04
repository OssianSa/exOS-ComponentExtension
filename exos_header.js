﻿
const version = "0.7.0";

//limit constants - generates error of exceeded
const MAX_ARRAY_NEST = 10;
const MAX_IDS = 256;
const MAX_AREA_NAME_LENGTH = 256;
const MAX_CONFIG_LENGTH = 60000;
let nestingDepth = 0;

/**
 * Not yet implemented:
 * - multidimensional arrays
 * - directly derived types
 * - value initialization of structures or structure members
 * 
 * Todos:
 * - binary blobs using ARRAY [..] OF BYTE
 * - create an error for directly derived types
 * - create an error for multidimenstional arrays
 * - what happens if one of the types arent found??
 *  */


const fs = require('fs');
const path = require('path');


/************************ JSON ***************************/

function findEnumTyp(fileLines, typName) {
    let i = 0;
    for (let line of fileLines) {
        //trim down to match the type name EXACTLY to specified name, includes() is also true for "myStruct" == "myStructSomething"
        let l = line.split(":");
        if ((l[0].trim() == typName) && (l[1].trim() == "") && (!line.includes("STRUCT"))) {
            return i;
        }
        i++;
    }
    return -1;
}
function findStructTyp(fileLines, typName) {
    let i = 0;
    for (let line of fileLines) {
        //trim down to match the type name EXACTLY to specified name, includes() is also true for "myStruct" == "myStructSomething"
        let l = line.split(":")[0].trim();
        if ((l == typName) && (line.includes("STRUCT"))) {
            return i;
        }
        i++;
    }
    return -1;
}
function findDirectlyDerivedType(fileLines, typName) {
    let i = 0;
    for (let line of fileLines) {
        //trim down to match the type name EXACTLY to specified name, includes() is also true for "myStruct" == "myStructSomething"
        let l = line.split(":");
        if ((l[0].trim() == typName) && (l[1].trim() != "") && (!line.includes("STRUCT"))) {
            return i;
        }
        i++;
    }
    return -1;
}

function isScalarType(type) {
    switch (type) {
        case "BOOL":
        case "USINT":
        case "SINT":
        case "UINT":
        case "INT":
        case "UDINT":
        case "DINT":
        case "REAL":
        case "LREAL":
        case "BYTE":
            return true;

        default:
            return false;
    }
}
function parseEnumMember(fileLines, index, enumValue) {

    let name = "";
    if (fileLines[index].includes("(")) {
        return null;
    }
    else if (fileLines[index].includes(":=")) {
        name = fileLines[index].split(":=")[0].trim();
        enumValue = fileLines[index].split(":=")[1].trim()
        enumValue = parseInt(enumValue.split(",")[0].trim());
    }
    else {
        name = fileLines[index].split(",")[0].trim();
    }

    return {
        name: "value",
        attributes: {
            name: name,
            value: enumValue
        }
    }

}
function takeout(line, start, end) {
    if (line.includes(start) && line.includes(end)) {
        return line.split(start)[1].split(end)[0];
    }
    else return null;
}

function parseStructMember(fileLines, index) {
    let arraySize = 0;
    let dimensions = [0];


    if (fileLines[index].includes(":")) {
        let name = fileLines[index].split(":")[0].trim();

        if (fileLines[index].includes("ARRAY")) {
            let ranges = takeout(fileLines[index], "[", "]")
            dimensions = ranges.split(",");

            if (dimensions.length > 1) {
                throw(`multi dimensional arrays are not supported -> member "${name}"`);
            }
            if (ranges != null) {
                let from = parseInt(ranges.split("..")[0].trim());
                let to = parseInt(ranges.split("..")[1].trim());
                arraySize = to - from + 1;
                nestingDepth += dimensions.length; //add a nesting depth for each dimention in multi-dim arrays
                if (nestingDepth > MAX_ARRAY_NEST) throw(`Member "${name}" has array nesting depth of ${nestingDepth} deeper than ${MAX_ARRAY_NEST} nests`);
            }
        }

        let type = "";
        if (arraySize > 0) {
            type = fileLines[index].split(":")[1].split("OF")[1].trim();
        }
        else {
            type = fileLines[index].split(":")[1].trim();
        }
        let comment = "";
        if (type.includes("(*")) {
            comment = takeout(type, "(*", "*)");
            type = type.split("(*")[0].trim();
        }

        if (type.includes("STRING")) {
            if (arraySize > 0) nestingDepth -= dimensions.length;
            let length = takeout(type, "[", "]");
            if (length != null) {
                return {
                    name: "variable",
                    attributes: {
                        name: name,
                        nodeId: "",
                        dataType: "STRING",
                        stringLength: parseInt(length) + 1,
                        comment: comment,
                        arraySize: arraySize
                    }
                }
            }
        }
        else if (isScalarType(type)) {
            if (arraySize > 0) nestingDepth -= dimensions.length;
            return {
                name: "variable",
                attributes: {
                    name: name,
                    nodeId: "",
                    dataType: type,
                    comment: comment,
                    arraySize: arraySize
                }
            }
        }
        else {
            //datatype detected = dig deeper
            let result = parseTyp(fileLines, name, type, comment, arraySize, false);
            if (arraySize > 0) nestingDepth -= dimensions.length;
            return result
        }
    }
    return null;
}

function parseTyp(fileLines, name, type, comment, arraySize, init) {
    let children = [];
    let start;

    //set root type properties and inits
    if (init) {
        nestingDepth = 0;
        name = "<NAME>";
    }

    start = findStructTyp(fileLines, type);
    //this is a structure
    if (start != -1) {
        let i = 1;
        while (!fileLines[start + i].includes("END_STRUCT")) {
            let member = parseStructMember(fileLines, start + i);
            if (member != null) {
                children.push(member);
            }
            i++;
        }
        return {
            name: "struct",
            attributes: {
                name: name,
                nodeId: "",
                dataType: type,
                comment: comment,
                arraySize: arraySize
            },
            children: children
        }
    }
    //this is an enum
    else {
        start = findEnumTyp(fileLines, type);
        if (start != -1) {
            let i = 1;
            let enumValue = 0;
            while (!fileLines[start + i].includes(")")) {
                let member = parseEnumMember(fileLines, start + i, enumValue);
                if (member != null) {
                    children.push(member);
                    enumValue = member.attributes.value + 1;
                }
                i++;
            }
            return {
                name: "enum",
                attributes: {
                    name: name,
                    nodeId: "",
                    dataType: type,
                    comment: comment,
                    arraySize: 0
                },
                children: children
            }
        } else {

            if (findDirectlyDerivedType(fileLines, type) >= 0) {
                //datatype was not found,in .typ file, if not kill with error
                throw(`Datatype '${type}' is a directly derived type. Not supported!`);
            } else {
                //datatype was not found,in .typ file, if not kill with error
                throw(`Datatype '${type}' not defined in .typ file`);
            }
        }
    }
    //will never happen
    return null;
}

/**
 * Parse a certain structure within a typ file and return its children as JSON array.
 * @param {string} fileName 
 * @param {string} typName 
 */
function parseTypFile(fileName, typName) {

    let fileLines = "";

    fileLines = fs.readFileSync(`${fileName}`).toString();

    fileLines = prepLines(fileLines);

    let type = parseTyp(fileLines, "", typName, "", 0, true);

    return type;
}

/****************************** TYPEDEFS ***********************************/
function convertPlcType(type) {
    switch (type) {
        case "BOOL": return "bool";
        case "USINT": return "uint8_t";
        case "SINT": return "int8_t";
        case "UINT": return "uint16_t";
        case "INT": return "int16_t";
        case "UDINT": return "uint32_t";
        case "DINT": return "int32_t";
        case "REAL": return "float";
        case "LREAL": return "double";
        case "BYTE": return "int8_t"
        default: //returning the type makes the function valid even if you insert a struct
            return type;
    }
}

function outputMember(type, name, arrays, comment) {
    let out = "";
    out += `    ${type} ${name}`

    if (arrays.length > 0) {
        for (let arr of arrays) {
            if (arr > 0) {
                out += `[${arr}]`
            }
        }
    }
    out += `;`

    if (comment != "") out += ` //${comment}`;
    out += `\n`;
    return out;
}

function isStructType(name, fileLines) {
    for (let line of fileLines) {
        if (line.includes("STRUCT") && line.includes(":")) {
            if (name == line.split(":")[0].trim()) return true;
        }
    }
    return false;
}

function prepLines(lines) {
    //remove stuff we dont want to look at
    lines = lines.split("\r").join("");
    lines = lines.split(";").join("");
    lines = lines.split("{REDUND_UNREPLICABLE}").join("");
    //now split with line endings
    lines = lines.split("\n");
    return lines;
}

function convertTyp2Struct(fileName) {

    let fileLines = "";

    fileLines = fs.readFileSync(`${fileName}`).toString();

    fileLines = prepLines(fileLines);

    let out = ``;
    let structname = "";
    let members = 0;
    let cmd = "find_struct_enum";
    let structs = [];
    for (let line of fileLines) {

        switch (cmd) {
            case "find_struct_enum":
                //analyze row check for struct, enum and directly derived types
                let comment = line.split("(*");
                if (comment.length > 1) {
                    comment = comment[1].split("*)");
                    comment = comment[0].trim();
                } else comment = "";

                line = line.split("(*")[0];
                line = line.split(":");
                for (let i = 0; i < line.length; i++) line[i] = line[i].trim();

                if (line[1] == ("STRUCT")) {
                    cmd = "read_struct";
                    if (comment != "") out += "//" + comment + "\n";
                    structname = line[0];
                    out += `typedef struct ${structname}\n{\n`;
                    structs.push({ name: structname, out: "", depends: [] });
                }
                else if (line[1] == ("")) {
                    cmd = "read_enum";
                    if (comment != "") out += "//" + comment + "\n";
                    structname = line[0];
                    out += `typedef enum ${structname}\n{\n`;
                    members = 0;
                    structs.push({ name: structname, out: "", depends: [] });
                }
                //"else" line[1] is not "" (enum) and not "STRUCT" then it have to be a derived type = do nothing
                break;

            case "read_enum":
                if (line.includes(")")) {
                    cmd = "find_struct_enum";
                    if (members > 0) {
                        out = out.slice(0, -2); //remove the last ,\n
                        out += `\n`;
                    }
                    out += `\n} ${structname};\n\n`;
                    structs[structs.length - 1].out = out;
                    out = "";
                }
                else if (!line.includes("(")) {
                    if (line.includes(":=")) {
                        name = line.split(":=")[0].trim();
                        let enumValue = line.split(":=")[1].trim();
                        enumValue = parseInt(enumValue.split(",")[0].trim());
                        out += `    ${name} = ${enumValue},\n`;
                    }
                    else {
                        name = line.split(",")[0].trim();
                        out += `    ${name},\n`;
                    }
                    members++;
                }
                break;

            case "read_struct":
                if (line.includes("END_STRUCT")) {
                    cmd = "find_struct_enum";
                    out += `\n} ${structname};\n\n`;
                    structs[structs.length - 1].out = out;
                    out = "";
                }
                else {
                    let arraySize = 0;
                    if (line.includes("ARRAY")) {
                        let range = takeout(line, "[", "]")
                        if (range != null) {
                            let from = parseInt(range.split("..")[0].trim());
                            let to = parseInt(range.split("..")[1].trim());
                            arraySize = to - from + 1;
                        }
                    }
                    if (line.includes(":")) {
                        let name = line.split(":")[0].trim();
                        let type = "";
                        if (arraySize > 0) {
                            type = line.split(":")[1].split("OF")[1].trim();
                        }
                        else {
                            type = line.split(":")[1].trim();
                        }
                        let comment = "";
                        if (type.includes("(*")) {
                            comment = takeout(type, "(*", "*)");
                            type = type.split("(*")[0].trim();
                        }

                        if (type.includes("STRING")) {
                            let length = takeout(type, "[", "]");
                            if (length != null) {
                                out += outputMember("char", name, [arraySize, parseInt(length) + 1], comment);
                            }
                        }
                        else if (isScalarType(type)) {
                            stdtype = convertPlcType(type);
                            out += outputMember(stdtype, name, [arraySize], comment);
                        }
                        else {
                            structs[structs.length - 1].depends.push(type); // push before adding "struct "
                            if (isStructType(type, fileLines)) {
                                type = "struct " + type;
                            }
                            out += outputMember(type, name, [arraySize], comment);
                        }
                    }
                }
                break;
        }
    }

    //sort the structs according to their dependencies
    if (structs.length > 1) {
        for (i = 0; i < structs.length; i++) {
            let maxindex = -1;
            for (let depend of structs[i].depends) {
                for (j = 0; j < structs.length; j++) {
                    if (structs[j].name == depend) {
                        if (j > maxindex) maxindex = j;
                    }
                }
            }
            if(maxindex != -1)
            {
                let tmpstructs = structs.splice(i, 1)[0];
                structs.splice(maxindex + 1, 0, tmpstructs);
            }
        }
    }

    //output the sorted structures
    out = "";
    for (let struct of structs) {
        out += struct.out;
    }
    return out;
}



/*********************** STRUCT INIT ************************** */


var types = [];
var infoId = 0;
function infoChildren(children, parent, parentArray) {
    let out = "";

    if (Array.isArray(children)) {
        for (let child of children) {

            infoId++; // start by increasing to reserve 0 for top level structure

            if (infoId > MAX_IDS) throw(`Too many infoId indexes needed. Max ${MAX_IDS} can be used.`);

            child.attributes.info = "<infoId" + infoId + ">";

            let arrayStr = "";
            if (child.attributes.arraySize > 0) {
                if (parentArray != "") {
                    arrayStr = `${parentArray},${child.attributes.arraySize}`;
                }
                else {
                    arrayStr = `${child.attributes.arraySize}`;
                }
            }
            else {
                arrayStr = `${parentArray}`;
            }

            function checkExosInfoCallParam(call) {
                let area = call.split("(")[1].split(")")[0].trim();
                if (area.length > MAX_AREA_NAME_LENGTH) throw(`Area name "${area}" longer than max (${MAX_AREA_NAME_LENGTH})`);
                return call;
            }

            if (child.name == "variable" || child.name == "enum") {
                if (parent == "") {
                    if (child.attributes.arraySize > 0) {
                        out += checkExosInfoCallParam(`        {EXOS_INFO(data.${child.attributes.name}),{${parentArray}}},\n`);
                        infoId++;
                        child.attributes.info2 = "<infoId" + infoId + ">";
                        out += checkExosInfoCallParam(`        {EXOS_INFO(data.${child.attributes.name}[0]),{${arrayStr}}},\n`);
                    }
                    else {
                        out += checkExosInfoCallParam(`        {EXOS_INFO(data.${child.attributes.name}),{${arrayStr}}},\n`);
                    }
                }
                else {
                    if (child.attributes.arraySize > 0) {
                        out += checkExosInfoCallParam(`        {EXOS_INFO(data.${parent}.${child.attributes.name}),{${parentArray}}},\n`);
                        infoId++;
                        child.attributes.info2 = "<infoId" + infoId + ">";
                        out += checkExosInfoCallParam(`        {EXOS_INFO(data.${parent}.${child.attributes.name}[0]),{${arrayStr}}},\n`);
                    }
                    else {
                        out += checkExosInfoCallParam(`        {EXOS_INFO(data.${parent}.${child.attributes.name}),{${arrayStr}}},\n`);
                    }
                }
            }
            else if (child.name == "struct" && child.hasOwnProperty("children")) {
                if (parent == "") {
                    if (child.attributes.arraySize > 0) {
                        out += checkExosInfoCallParam(`        {EXOS_INFO(data.${child.attributes.name}),{${parentArray}}},\n`);
                        infoId++;
                        child.attributes.info2 = "<infoId" + infoId + ">";
                        out += checkExosInfoCallParam(`        {EXOS_INFO(data.${child.attributes.name}[0]),{${arrayStr}}},\n`);
                        out += infoChildren(child.children, `${child.attributes.name}[0]`, arrayStr);
                    }
                    else {
                        out += checkExosInfoCallParam(`        {EXOS_INFO(data.${child.attributes.name}),{${arrayStr}}},\n`);
                        out += infoChildren(child.children, child.attributes.name, arrayStr);
                    }
                }
                else {
                    if (child.attributes.arraySize > 0) {

                        out += checkExosInfoCallParam(`        {EXOS_INFO(data.${parent}.${child.attributes.name}),{${parentArray}}},\n`);
                        infoId++;
                        child.attributes.info2 = "<infoId" + infoId + ">";
                        out += checkExosInfoCallParam(`        {EXOS_INFO(data.${parent}.${child.attributes.name}[0]),{${arrayStr}}},\n`);
                        out += infoChildren(child.children, `${parent}.${child.attributes.name}[0]`, arrayStr);

                    }
                    else {
                        out += checkExosInfoCallParam(`        {EXOS_INFO(data.${parent}.${child.attributes.name}),{${arrayStr}}},\n`);
                        out += infoChildren(child.children, `${parent}.${child.attributes.name}`, arrayStr);
                    }
                }
            }
        }
    }
    return out;
}

// Generate a register function with INFO for each type 
// Not used at the moment, enable be removing outcomment in function generateHeader:
// out += generateStructRegister(typName, types.children);
var generatedStructTypes = [];
function generateStructRegister(typName, children) {
    let out = "";

    generatedStructTypes.push(typName);

    out += `EXOS_HANDLE exos_registerType_${typName}(EXOS_HANDLE artefactHandle, ${typName} *data)\n{\n`;

    out += `    info_t info[] = {\n`;
    out += `        INFO(*data),\n`;
    out += infoChildren(children, "", "");

    out = out.slice(0, -2); //remove the last ,\n
    out += `\n`;

    out += `    };\n\n`;
    out += `    exos_internal_calcOffsets(info, sizeof(info));\n`;
    out += `    return exos_internal_registerType(artefactHandle, info, sizeof(info));\n`;

    out += `}\n\n`;

    if (Array.isArray(children)) {
        for (let child of children) {
            if (child.name == "struct" && child.hasOwnProperty("children") && !generatedStructTypes.includes(child.attributes.dataType)) {
                out += generateStructRegister(child.attributes.dataType, child.children);
            }
        }
    }
    return out;
}

function generateHeader(fileName, typName) {

    nestingDepth = 0;
    infoId = 0;

    types = parseTypFile(fileName, typName);

    types.attributes.info = "<infoId" + infoId + ">"; // top level
    info = infoChildren(types.children, "", ""); // needs to be called before JSON.stringify to generate infoId

    let out = "";
    out = `/*Automatically generated header file from ${path.basename(fileName)}*/\n\n`;

    out += `#ifndef _${typName.toUpperCase()}_H_\n`;
    out += `#define _${typName.toUpperCase()}_H_\n\n`;
    out += `#include "exos_api_internal.h"\n\n`;
    out += `#ifdef _SG4\n`;
    out += `#include <${typName.substring(0, 10)}.h>\n`;
    out += `#else\n`;
    out += `#include <stddef.h>\n`;
    out += `#include <stdint.h>\n`;
    out += `#include <stdbool.h>\n\n`;

    out += convertTyp2Struct(fileName);

    out += `#endif // _SG4\n\n`

    let jsonConfig = JSON.stringify(types).split('"').join('\\"');
    if (jsonConfig.length > MAX_CONFIG_LENGTH) throw(`JSON config (${jsonConfig.length} chars) is longer than maximum (${MAX_CONFIG_LENGTH}).`);

    out += `const char config_${typName.toLowerCase()}[] = "${jsonConfig}";\n\n`; // one liner with escapes on "
    //out += `const char config_${typName.toLowerCase()}[] = "${JSON.stringify(types,null,4).split('"').join('\\"').split('\n').join(' \\\n')}";\n\n`; // pretty print with escapes on " and \ for multiline string
    //out += `const char config_${typName.toLowerCase()}[] = "${JSON.stringify(types,null,4)}";\n\n`; // pretty print without escapes (wont compile)

    out += `/*Register this artefact on the Server and create the OPCUA structure for the ${typName} structure*/\n`;
    out += `EXOS_ERROR_CODE exos_artefact_register_${typName.toLowerCase()}(exos_artefact_handle_t *artefact, exos_connection_changed_cb connection_changed)\n{\n`;
    out += `    ${typName} data;\n`;
    out += `    exos_info_t info[] = {\n`;
    out += `        {EXOS_INFO(data),{}},\n`;
    out += info;
    out = out.slice(0, -2); //remove the last ,\n
    out += `\n`;
    out += `    };\n\n`;


    out += `    _exos_internal_calc_offsets(info,sizeof(info));\n\n`;

    out += `    return _exos_internal_artefact_register(artefact, config_${typName.toLowerCase()}, info, sizeof(info), connection_changed);\n`;
    out += `}\n\n`;

    //register function with INFO for each type: out += generateStructRegister(typName, types.children);

    out += `#endif // _${typName.toUpperCase()}_H_\n`

    return out;
}


if (require.main === module) {

    process.stdout.write(`exos_header version ${version}\n`);

    if (process.argv.length > 3) {
        let outPath = process.argv[4];
        if (outPath == "" || outPath == undefined) {
            outPath = ".";
        }

        let fileName = process.argv[2];
        let structName = process.argv[3];

        if (fs.existsSync(fileName)) {

            try {
                    
                let out = generateHeader(fileName, structName);
                fs.writeFileSync(`${outPath}/exos_${structName.toLowerCase()}.h`, out);
                process.stdout.write(`${outPath}/exos_${structName.toLowerCase()}.h generated`);

            } catch (error) {
                process.stderr.write(error);        
            }

        } else {
            process.stderr.write(`file '${fileName}' not found.`);
        }

    }
    else {
        process.stderr.write("usage: ./exos_header.js <filename.typ> <structname> <header output path>\n");
    }
}

module.exports = {
    parseTypFile,
    generateHeader,
    convertPlcType
}
