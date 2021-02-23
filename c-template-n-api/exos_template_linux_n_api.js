#!/usr/bin/env node

const header = require('../exos_header');
const fs = require('fs');

function generateLinuxPackage(typName) {
    let out = "";

    out += `<?xml version="1.0" encoding="utf-8"?>\n`;
    out += `<?AutomationStudio Version=4.9.1.69?>\n`;
    out += `<Package SubType="exosLinuxPackage" PackageType="exosLinuxPackage" xmlns="http://br-automation.co.at/AS/Package">\n`;
    out += `  <Objects>\n`;
    out += `    <Object Type="File">build.sh</Object>\n`;
    out += `    <Object Type="File">${typName.toLowerCase()}.js</Object>\n`;
    out += `    <Object Type="File">exos_${typName.toLowerCase()}.h</Object>\n`;
    out += `    <Object Type="File">l_${typName.toLowerCase()}.node</Object>\n`;
    out += `    <Object Type="File">binding.gyp</Object>\n`;
    out += `    <Object Type="File">lib${typName.toLowerCase()}.c</Object>\n`;
    out += `  </Objects>\n`;
    out += `</Package>\n`;

    return out;
}

function generateShBuild() {
    let out = "";

    out += `#!/bin/sh\n\n`;
    out += `finalize() {\n`;
    out += `    rm -rf build/*\n`;
    out += `    rm -r build\n`;
    out += `    sync\n`;
    out += `    exit $1\n`;
    out += `}\n\n`;
    out += `node-gyp rebuild\n`;
    out += `if [ "$?" -ne 0 ] ; then\n`;
    out += `    finalize 1\n`;
    out += `fi\n\n`;
    out += `cp -f build/Release/l_*.node .\n\n`;
    out += `finalize 0`;

    return out;
}

function generateExosPkg(typName, libName, fileName) {
    let out = "";

    out += `<?xml version="1.0" encoding="utf-8"?>\n`;
    out += `<ComponentPackage Version="1.0.0" ErrorHandling="Ignore" StartupTimeout="0">\n`;
    out += `    <Service Name="${typName} Runtime Service" Executable="/usr/bin/node" Arguments="/home/user/${typName.toLowerCase()}/${typName.toLowerCase()}.js"/>\n`;
    out += `    <DataModelInstance Name="${typName}"/>\n`;
    out += `    <File Name="${typName.toLowerCase()}-script" FileName="Linux\\${typName.toLowerCase()}.js" Type="Project"/>\n`;
    out += `    <File Name="${typName.toLowerCase()}-lib" FileName="Linux\\l_${typName.toLowerCase()}.node" Type="Project"/>\n`;
    out += `    <Installation Type="Preinst" Command="mkdir /home/user/${typName.toLowerCase()}/"/>\n`;
    out += `    <Installation Type="Prerun" Command="cp /var/cache/exos/${typName.toLowerCase()}.js /home/user/${typName.toLowerCase()}/"/>\n`;
    out += `    <Installation Type="Prerun" Command="cp /var/cache/exos/l_${typName.toLowerCase()}.node /home/user/${typName.toLowerCase()}/"/>\n`;
    out += `    <Installation Type="Postrm" Command="rm -r /home/user/${typName.toLowerCase()}"/>\n`;
    out += `    <Build>\n`;
    out += `        <GenerateHeader FileName="${typName}\\${typName}.typ" TypeName="${typName}">\n`;
    out += `            <SG4 Include="${fileName.split(".")[0].toLowerCase()}TYP.h"/>\n`;
    out += `            <Output Path="Linux"/>\n`;
    out += `            <Output Path="${libName}"/>\n`;
    out += `        </GenerateHeader>\n`;
    out += `        <BuildCommand Command="C:\\Windows\\Sysnative\\wsl.exe" WorkingDirectory="Linux" Arguments="--distribution Debian --exec ./build.sh">\n`;
    out += `            <Dependency FileName="Linux\\exos_${typName.toLowerCase()}.h"/>\n`;
    out += `            <Dependency FileName="Linux\\lib${typName.toLowerCase()}.c"/>\n`;
    out += `        </BuildCommand>\n`;
    out += `    </Build>\n`;
    out += `</ComponentPackage>\n`;

    return out;
}

function generateExosCallbacks(template) {
    let out = "";
    out += `static void datasetEvent(exos_dataset_handle_t *dataset, EXOS_DATASET_EVENT_TYPE event_type, void *info)\n{\n`;
    out += `    switch (event_type)\n    {\n`;
    out += `    case EXOS_DATASET_EVENT_UPDATED:\n`;
    var atleastone = false;
    for (let dataset of template.datasets) {
        if (dataset.comment.includes("PUB")) {
            if (atleastone) {
                out += `        else `;
            }
            else {
                out += `        `;
                atleastone = true;
            }
            out += `if(0 == strcmp(dataset->name,"${dataset.structName}"))\n`;
            out += `        {\n`;

            if (dataset.dataType === "STRING") {
                out += `            memcpy(&exos_data.${dataset.structName}, dataset->data, sizeof(exos_data.${dataset.structName}));\n`;
                out += `            //truncate string to max chars since memcpy do not check for null char.\n`;
                out += `            ${header.convertPlcType(dataset.dataType)} *p = (${header.convertPlcType(dataset.dataType)} *)&exos_data.${dataset.structName};\n`;
                out += `            p = p + sizeof(exos_data.${dataset.structName}) - 1;\n`;
                out += `            *p = '\0';\n\n`;
            } else if (header.isScalarType(dataset.dataType)) {
                out += `            exos_data.${dataset.structName} = *(${header.convertPlcType(dataset.dataType)} *)dataset->data;\n\n`;
            } else {
                out += `            memcpy(&exos_data.${dataset.structName}, dataset->data, sizeof(exos_data.${dataset.structName}));\n\n`;
            }

            out += `            if (${dataset.structName}.onchange_cb != NULL)\n`;
            out += `            {\n`;
            out += `                napi_acquire_threadsafe_function(${dataset.structName}.onchange_cb);\n`;
            out += `                napi_call_threadsafe_function(${dataset.structName}.onchange_cb, &exos_data.${dataset.structName}, napi_tsfn_blocking);\n`;
            out += `                napi_release_threadsafe_function(${dataset.structName}.onchange_cb, napi_tsfn_release);\n`;
            out += `            }\n`;
            out += `        }\n`;
        }
    }
    out += `        break;\n\n`;

    out += `    case EXOS_DATASET_EVENT_PUBLISHED:\n`;
    out += `    case EXOS_DATASET_EVENT_DELIVERED:\n`;
    atleastone = false;
    for (let dataset of template.datasets) {
        if (dataset.comment.includes("SUB")) {
            if (atleastone) {
                out += `        else `;
            }
            else {
                out += `        `;
                atleastone = true;
            }
            out += `if(0 == strcmp(dataset->name, "${dataset.structName}"))\n`;
            out += `        {\n`;
            out += `            //${header.convertPlcType(dataset.dataType)} *${dataset.varName} = (${header.convertPlcType(dataset.dataType)} *)dataset->data;\n`;
            out += `        }\n`;
        }
    }
    out += `        break;\n\n`;

    out += `    case EXOS_DATASET_EVENT_CONNECTION_CHANGED:\n`;
    for (let dataset of template.datasets) {
        atleastone = false;
        if (atleastone) {
            out += `        else `;
        }
        else {
            out += `        `;
            atleastone = true;
        }
        out += `if(0 == strcmp(dataset->name, "${dataset.structName}"))\n`;
        out += `        {\n`;
        out += `            if (${dataset.structName}.connectiononchange_cb != NULL)\n`;
        out += `            {\n`;
        out += `                napi_acquire_threadsafe_function(${dataset.structName}.connectiononchange_cb);\n`;
        out += `                napi_call_threadsafe_function(${dataset.structName}.connectiononchange_cb, exos_get_state_string(dataset->connection_state), napi_tsfn_blocking);\n`;
        out += `                napi_release_threadsafe_function(${dataset.structName}.connectiononchange_cb, napi_tsfn_release);\n`;
        out += `            }\n`;
        out += `        }\n`;
    }
    out += `\n`;
    out += `        switch (dataset->connection_state)\n`;
    out += `        {\n`;
    out += `        case EXOS_STATE_DISCONNECTED:\n`;
    out += `        case EXOS_STATE_CONNECTED:\n`;
    out += `        case EXOS_STATE_OPERATIONAL:\n`;
    out += `        case EXOS_STATE_ABORTED:\n`;
    out += `            break;\n`;
    out += `        }\n`;
    out += `        break;\n`;
    out += `    }\n`;
    out += `}\n\n`;

    out += `static void datamodelEvent(exos_datamodel_handle_t *datamodel, const EXOS_DATAMODEL_EVENT_TYPE event_type, void *info)\n{\n`;
    out += `    switch (event_type)\n    {\n`;
    out += `    case EXOS_DATAMODEL_EVENT_CONNECTION_CHANGED:\n`;

    out += `        if (${template.datamodel.varName}.connectiononchange_cb != NULL)\n`;
    out += `        {\n`;
    out += `            napi_acquire_threadsafe_function(${template.datamodel.varName}.connectiononchange_cb);\n`;
    out += `            napi_call_threadsafe_function(${template.datamodel.varName}.connectiononchange_cb, exos_get_state_string(datamodel->connection_state), napi_tsfn_blocking);\n`;
    out += `            napi_release_threadsafe_function(${template.datamodel.varName}.connectiononchange_cb, napi_tsfn_release);\n`;
    out += `        }\n\n`;
    out += `        switch (datamodel->connection_state)\n`;
    out += `        {\n`;
    out += `        case EXOS_STATE_DISCONNECTED:\n`;
    out += `        case EXOS_STATE_CONNECTED:\n`;
    out += `        case EXOS_STATE_OPERATIONAL:\n`;
    out += `        case EXOS_STATE_ABORTED:\n`;
    out += `            break;\n;`;
    out += `        }\n`;
    out += `        break;\n`;
    out += `    }\n`;
    out += `}\n\n`;

    return out;
}

function generateNApiCBinitMMain() {

    let out = "";

    out += `// napi callback setup main function\n`;
    out += `napi_value init_napi_onchange(napi_env env, napi_callback_info info, const char *identifier, napi_threadsafe_function_call_js call_js_cb, napi_threadsafe_function *result)\n`;
    out += `{\n`;
    out += `    size_t argc = 1;\n`;
    out += `    napi_value argv[1];\n\n`;

    out += `    if (napi_ok != napi_get_cb_info(env, info, &argc, argv, NULL, NULL))\n`;
    out += `    {\n`;
    out += `        char msg[100] = {};\n`;
    out += `        strcpy(msg, "init_napi_onchange() napi_get_cb_info failed - ");\n`;
    out += `        strcat(msg, identifier);\n`;
    out += `        napi_throw_error(env, "EINVAL", msg);\n`;
    out += `        return NULL;\n`;
    out += `    }\n\n`;

    out += `    if (argc < 1)\n`;
    out += `    {\n`;
    out += `        napi_throw_error(env, "EINVAL", "Too few arguments");\n`;
    out += `        return NULL;\n`;
    out += `    }\n\n`;

    out += `    napi_value work_name;\n`;
    out += `    if (napi_ok != napi_create_string_utf8(env, identifier, NAPI_AUTO_LENGTH, &work_name))\n`;
    out += `    {\n`;
    out += `        char msg[100] = {};\n`;
    out += `        strcpy(msg, "init_napi_onchange() napi_create_string_utf8 failed - ");\n`;
    out += `        strcat(msg, identifier);\n`;
    out += `        napi_throw_error(env, "EINVAL", msg);\n`;
    out += `        return NULL;\n`;
    out += `    }\n\n`;

    out += `    napi_valuetype cb_typ;\n`;
    out += `    if (napi_ok != napi_typeof(env, argv[0], &cb_typ))\n`;
    out += `    {\n`;
    out += `        char msg[100] = {};\n`;
    out += `        strcpy(msg, "init_napi_onchange() napi_typeof failed - ");\n`;
    out += `        strcat(msg, identifier);\n`;
    out += `        napi_throw_error(env, "EINVAL", msg);\n`;
    out += `        return NULL;\n`;
    out += `    }\n\n`;

    out += `    if (cb_typ == napi_function)\n`;
    out += `    {\n`;
    out += `        if (napi_ok != napi_create_threadsafe_function(env, argv[0], NULL, work_name, 0, 1, NULL, NULL, NULL, call_js_cb, result))\n`;
    out += `        {\n`;
    out += `            const napi_extended_error_info *info;\n`;
    out += `            napi_get_last_error_info(env, &info);\n`;
    out += `            napi_throw_error(env, NULL, info->error_message);\n`;
    out += `            return NULL;\n`;
    out += `        }\n`;
    out += `    }\n`;
    out += `    return NULL;\n`;
    out += `}\n\n`;

    return out;
}

function generateConnectionCallbacks(template) {
    let out = "";

    out += `// js object callbacks\n`;

    //datamodel
    out += `static void ${template.datamodel.varName}_connonchange_js_cb(napi_env env, napi_value js_cb, void *context, void *data)\n`;
    out += `{\n`;
    out += `    const char *string = data;\n`;
    out += `    napi_value undefined;\n\n`;

    out += `    napi_get_undefined(env, &undefined);\n\n`;

    out += `    if (napi_ok != napi_create_string_utf8(env, string, strlen(string), &${template.datamodel.varName}.value))\n`;
    out += `        napi_throw_error(env, "EINVAL", "Can't create utf8 string from char* - ${template.datamodel.varName}.value");\n\n`;

    out += `    if (napi_ok != napi_get_reference_value(env, ${template.datamodel.varName}.ref, &${template.datamodel.varName}.object_value))\n`;
    out += `        napi_throw_error(env, "EINVAL", "Can't get reference - ${template.datamodel.varName} ");\n\n`;

    out += `    if (napi_ok != napi_set_named_property(env, ${template.datamodel.varName}.object_value, "connectionState", ${template.datamodel.varName}.value))\n`;
    out += `        napi_throw_error(env, "EINVAL", "Can't set connectionState property - ${template.datamodel.varName}");\n\n`;

    out += `    if (napi_ok != napi_call_function(env, undefined, js_cb, 0, NULL, NULL))\n`;
    out += `        napi_throw_error(env, "EINVAL", "Can't call connectionOnChange callback - ${template.datamodel.varName}");\n`;
    out += `}\n\n`;

    //datasets
    for (let dataset of template.datasets) {
        out += `static void ${dataset.structName}_connonchange_js_cb(napi_env env, napi_value js_cb, void *context, void *data)\n`;
        out += `{\n`;
        out += `    const char *string = data;\n`;
        out += `    napi_value undefined;\n\n`;

        out += `    napi_get_undefined(env, &undefined);\n\n`;

        out += `    if (napi_ok != napi_create_string_utf8(env, string, strlen(string), &${dataset.structName}.value))\n`;
        out += `        napi_throw_error(env, "EINVAL", "Can't create utf8 string from char* - ${dataset.structName}.value");\n\n`;

        out += `    if (napi_ok != napi_get_reference_value(env, ${dataset.structName}.ref, &${dataset.structName}.object_value))\n`;
        out += `        napi_throw_error(env, "EINVAL", "Can't get reference - ${dataset.structName} ");\n\n`;

        out += `    if (napi_ok != napi_set_named_property(env, ${dataset.structName}.object_value, "connectionState", ${dataset.structName}.value))\n`;
        out += `        napi_throw_error(env, "EINVAL", "Can't set connectionState property - ${dataset.structName}");\n\n`;

        out += `    if (napi_ok != napi_call_function(env, undefined, js_cb, 0, NULL, NULL))\n`;
        out += `        napi_throw_error(env, "EINVAL", "Can't call connectionOnChange callback - ${dataset.structName}");\n`;
        out += `}\n\n`;
    }

    return out;
}

function generateValueCallbacks(template) {
    let out = "";

    out += `// js value callbacks\n`;

    for (let dataset of template.datasets) {
        if (dataset.comment.includes("PUB")) {
            out += `static void ${dataset.structName}_onchange_js_cb(napi_env env, napi_value js_cb, void *context, void *data)\n`;
            out += `{\n`;
            out += `    //TBD\n`;
            out += `    ;\n`;

            out += `}\n\n`;
        }
    }

    return out;
}

function generateCallbackInits(template) {
    let out = "";

    out += `// js callback inits\n`;
    out += `napi_value ${template.datamodel.varName}_connonchange_init(napi_env env, napi_callback_info info)\n`;
    out += `{\n`;
    out += `    return init_napi_onchange(env, info, "${template.datamodel.structName} connection change", ${template.datamodel.varName}_connonchange_js_cb, &${template.datamodel.varName}.connectiononchange_cb);\n`;
    out += `}\n\n`;

    for (let dataset of template.datasets) {
        out += `napi_value ${dataset.structName}_connonchange_init(napi_env env, napi_callback_info info)\n`;
        out += `{\n`;
        out += `    return init_napi_onchange(env, info, "${dataset.structName} connection change", ${dataset.structName}_connonchange_js_cb, &${dataset.structName}.connectiononchange_cb);\n`;
        out += `}\n\n`;
    }

    for (let dataset of template.datasets) {
        if (dataset.comment.includes("PUB")) {
            out += `napi_value ${dataset.structName}_onchange_init(napi_env env, napi_callback_info info)\n`;
            out += `{\n`;
            out += `    return init_napi_onchange(env, info, "${dataset.structName} dataset change", ${dataset.structName}_onchange_js_cb, &${dataset.structName}.onchange_cb);\n`;
            out += `}\n\n`;
        }
    }

    return out;
}

function readType(fileName, typName) {
    var template = {
        headerName: "",
        datamodel: {
            structName: "",
            varName: "",
            dataType: "",
            comment: ""
        },
        datasets: [],
        logname: ""
    }

    if (fs.existsSync(fileName)) {

        var types = header.parseTypFile(fileName, typName);

        template.logname = "logger";
        template.headerName = `exos_${types.attributes.dataType.toLowerCase()}.h`

        template.datamodel.dataType = types.attributes.dataType;
        template.datamodel.structName = types.attributes.dataType;
        //check if toLowerCase is equal to datatype name, then extend it with _datamodel
        if (types.attributes.dataType == types.attributes.dataType.toLowerCase()) {
            template.datamodel.varName = types.attributes.dataType.toLowerCase() + "_datamodel";
        }
        else {
            template.datamodel.varName = types.attributes.dataType.toLowerCase();
        }

        //check if toLowerCase is same as struct name, then extend it with _dataset
        for (let child of types.children) {
            if (child.attributes.name == child.attributes.name.toLowerCase()) {
                let object = {}
                object["structName"] = child.attributes.name;
                object["varName"] = child.attributes.name.toLowerCase() + "_dataset";
                object["dataType"] = child.attributes.dataType;
                object["arraySize"] = child.attributes.arraySize;
                object["comment"] = child.attributes.comment;
                if (child.attributes.hasOwnProperty("stringLength")) { object["stringLength"] = child.attributes.stringLength; }
                template.datasets.push(object);
            }
            else {
                let object = {}
                object["structName"] = child.attributes.name;
                object["varName"] = child.attributes.name.toLowerCase();
                object["dataType"] = child.attributes.dataType;
                object["arraySize"] = child.attributes.arraySize;
                object["comment"] = child.attributes.comment;
                if (child.attributes.hasOwnProperty("stringLength")) { object["stringLength"] = child.attributes.stringLength; }
                template.datasets.push(object);
                ;
            }
        }

        // initialize non-string comments to "" and missing arraysizes to 0
        for (let dataset of template.datasets) {
            if (typeof dataset.comment !== 'string') {
                dataset.comment = "";
            }
            if (typeof dataset.arraySize !== 'number') {
                dataset.arraySize = 0;
            }
        }

    } else {
        throw (`file '${fileName}' not found.`);
    }

    return template;
}

function pubFetchData(type, varName) {
    let out = "";

    switch (type) {
        case "BOOL":
            out += `    if (napi_ok != napi_get_value_bool(env, value, &${varName}))\n`;
            out += `    {\n`;
            out += `        napi_throw_error(env, "EINVAL", "Expected bool");\n`;
            out += `        return NULL;\n`;
            out += `    }\n`;
            break;
        case "BYTE":
        case "USINT":
        case "SINT":
        case "UINT":
        case "INT":
        case "UDINT":
        case "DINT":
            out += `    int32_t _value;\n`;
            out += `    if (napi_ok != napi_get_value_int32(env, value, &_value))\n`;
            out += `    {\n`;
            out += `        napi_throw_error(env, "EINVAL", "Expected number convertable to 32bit");\n`;
            out += `        return NULL;\n`;
            out += `    }\n`;
            out += `    ${varName} = (${header.convertPlcType(type)})_value;\n`;
            break;
        case "REAL":
        case "LREAL":
            out += `    double_t _value;\n`;
            out += `    if (napi_ok != napi_get_value_double(env, value, &_value))\n`;
            out += `    {\n`;
            out += `        napi_throw_error(env, "EINVAL", "Expected number convertable to double float");\n`;
            out += `        return NULL;\n`;
            out += `    }\n`;
            out += `    ${varName} = (${header.convertPlcType(type)})_value;\n`;
            break;
        case "STRING":
            out += `    size_t _r\n`;
            out += `    if (napi_ok != napi_get_value_string_utf8(env, value, (char *)&${varName}, sizeof(${varName}), &_r))\n`;
            out += `    {\n`;
            out += `        napi_throw_error(env, "EINVAL", "Expected string");\n`;
            out += `        return NULL;\n`;
            out += `    }\n`;
            break;
    }

    return out;
}

function generateValuesPublishItem(fileName, prefix, dataset, init) {
    let out = "";

    if (header.isScalarType(dataset.dataType)) {
        if (dataset.arraySize > 0) {
            out += `for (uint32_t i = 0; i < ${dataset.arraySize}; i++)\n`;
            out += `{\n`;
            out += `    napi_value value;\n\n`;
            out += `    napi_get_element(env, ${dataset.structName}.value, i, &value);\n`;
            out += pubFetchData(dataset.dataType, `${prefix}${dataset.structName}[i]`)
            out += `}\n\n`;
        } else {
            out += pubFetchData(dataset.dataType, `${prefix}${dataset.structName}`);
            out += `\n`;
        }
    } else {
        //resolve datatype and call self...
        if (dataset.arraySize > 0) {
            let types = readType(fileName, "MyAppPar_t");
            let a = types;
        } else {
            ;
        }
    }

    return out;
}

function generateValuesPublishMethods(fileName, template, init) {
    let out = "";

    out += `// publish methods\n`;

    for (let dataset of template.datasets) {
        if (dataset.comment.includes("SUB")) {
            out += `napi_value ${dataset.structName}_publish_method(napi_env env, napi_callback_info info)\n`;
            out += `{\n`;

            out += `    if (napi_ok != napi_get_reference_value(env, ${dataset.structName}.ref, &${dataset.structName}.object_value))\n`;
            out += `    {\n`;
            out += `        napi_throw_error(env, "EINVAL", "Can't get reference");\n`;
            out += `        return NULL;\n`;
            out += `    }\n\n`;
            out += `    if (napi_ok != napi_get_named_property(env, ${dataset.structName}.object_value, "value", &${dataset.structName}.value))\n`;
            out += `    {\n`;
            out += `        napi_throw_error(env, "EINVAL", "Can't get property");\n`;
            out += `        return NULL;\n`;
            out += `}\n\n`;

            out += generateValuesPublishItem(fileName, "exos_data.", dataset, null);

            out += `    exos_dataset_publish(&${dataset.structName}_dataset);\n`;
            out += `    return NULL;\n`;
            out += `}\n\n`;
        }
    }

    return out;
}

function generateCleanUpHookCyclic(template) {
    let out = "";

    out += `// cleanup/cyclic\n`;
    out += `static void cleanup_${template.datamodel.varName}(void *env)\n`;
    out += `{\n`;
    out += `    uv_idle_stop(&cyclic_h);\n\n`;
    out += `    if (EXOS_ERROR_OK != exos_datamodel_delete(&${template.datamodel.varName}_datamodel))\n`;
    out += `    {\n`;
    out += `        napi_throw_error(env, "EINVAL", "Can't delete datamodel");\n`;
    out += `    }\n`;
    out += `}\n\n`;

    out += `void cyclic(uv_idle_t * handle) \n`;
    out += `{\n`;
    out += `    exos_datamodel_process(&${template.datamodel.varName}_datamodel); \n`;
    out += `    usleep(2000);\n`;
    out += `}\n\n`;

    return out;
}

function generateInitFunction(template) {
    let out = "";

    // declarations
    out += `napi_value init_${template.datamodel.varName}(napi_env env, napi_value exports)\n{\n`;

    out += `    napi_value `;
    out += `${template.datamodel.varName}_conn_change,`;
    for (let i = 0; i < template.datasets.length; i++) {
        out += ` ${template.datasets[i].structName}_conn_change`;
        if ((i + 1) != template.datasets.length) {
            out += `,`;
        }
    }
    out += `;\n`;

    let atleastone = false;
    for (let i = 0; i < template.datasets.length; i++) {
        if (template.datasets[i].comment.includes("PUB")) {
            if (atleastone == true) {
                out += `,`;
            }
            if (atleastone == false) {
                out += `    napi_value`;
                atleastone = true;
            }
            out += ` ${template.datasets[i].structName}_onchange`;
        }
    }
    if (atleastone == true) {
        out += `;\n`;
        atleastone = false;
    }

    for (let i = 0; i < template.datasets.length; i++) {
        if (template.datasets[i].comment.includes("SUB")) {
            if (atleastone == true) {
                out += `,`;
            }
            if (atleastone == false) {
                out += `    napi_value`;
                atleastone = true;
            }
            out += ` ${template.datasets[i].structName}_publish`;
        }
    }
    if (atleastone == true) {
        out += `;\n`;
        atleastone = false;
    }

    // base variables needed
    out += `\n    napi_value dataModel, undefined, def_bool, def_number, def_string;\n\n`;
    out += `    napi_get_boolean(env, BUR_NAPI_DEFAULT_BOOL_INIT, &def_bool);\n`;
    out += `    napi_create_int32(env, BUR_NAPI_DEFAULT_NUM_INIT, &def_number);\n`;
    out += `    napi_create_string_utf8(env, BUR_NAPI_DEFAULT_STRING_INIT, sizeof(BUR_NAPI_DEFAULT_STRING_INIT), &def_string);\n\n`;
    out += `    napi_get_undefined(env, &undefined);\n\n`;

    // create base objects
    out += `    if (napi_ok != napi_create_object(env, &${template.datamodel.varName}.value))\n        return NULL;\n\n`;
    for (let i = 0; i < template.datasets.length; i++) {
        out += `    if (napi_ok != napi_create_object(env, &${template.datasets[i].structName}.value))\n        return NULL;\n\n`;
    }

    // BUILD OBJECTS....

    //bind topics to artefact
    for (let i = 0; i < template.datasets.length; i++) {
        out += `    napi_set_named_property(env, dataModel, "${template.datasets[i].structName}", ${template.datasets[i].structName}.value);\n`;
    }
    out += `    napi_set_named_property(env, ${template.datamodel.varName}.value, "dataModel", dataModel);\n`;
    out += `    napi_create_function(env, NULL, 0, ${template.datamodel.varName}_connonchange_init, NULL, &${template.datamodel.varName}_conn_change);\n`;
    out += `    napi_set_named_property(env, ${template.datamodel.varName}.value, "connectionOnChange", ${template.datamodel.varName}_conn_change);\n`;
    out += `    napi_set_named_property(env, ${template.datamodel.varName}.value, "connectionState", undefined);\n\n`;

    //export the application
    out += `    napi_set_named_property(env, exports, "${template.datamodel.structName}", ${template.datamodel.varName}.value);\n\n`;

    //save references to objects
    out += `    if (napi_ok != napi_create_reference(env, ${template.datamodel.varName}.value, ${template.datamodel.varName}.ref_count, &${template.datamodel.varName}.ref))\n`;
    out += `    {\n`;
    out += `        napi_throw_error(env, "EINVAL", "Can't create ${template.datamodel.varName} reference");\n`;
    out += `        return NULL;\n`;
    out += `    }\n`;
    for (let i = 0; i < template.datasets.length; i++) {
        out += `    if (napi_ok != napi_create_reference(env, ${template.datasets[i].structName}.value, ${template.datasets[i].structName}.ref_count, &${template.datasets[i].structName}.ref))\n`;
        out += `    {\n`;
        out += `        napi_throw_error(env, "EINVAL", "Can't create ${template.datasets[i].structName} reference");\n`;
        out += `        return NULL;\n`;
        out += `    }\n`;
    }
    out += `\n`;

    // register cleanup hook
    out += `    if (napi_ok != napi_add_env_cleanup_hook(env, cleanup_${template.datamodel.varName}, env))\n`;
    out += `    {\n`;
    out += `        napi_throw_error(env, "EINVAL", "Can't register cleanup hook");\n`;
    out += `        return NULL;\n`;
    out += `    }\n\n`;

    // exOS
    // exOS inits
    out += `    if (EXOS_ERROR_OK != exos_datamodel_init(&${template.datamodel.varName}_datamodel, "${template.datamodel.structName}", "${template.datamodel.structName}_NodeJS"))\n`;
    out += `        {\n`;
    out += `            napi_throw_error(env, "EINVAL", "Can't initialize ${template.datamodel.structName}");\n`;
    out += `        }\n\n`;

    out += `    ${template.datamodel.varName}_datamodel.user_context = NULL; \n`;
    out += `    ${template.datamodel.varName}_datamodel.user_tag = 0; \n\n`;

    for (let i = 0; i < template.datasets.length; i++) {
        out += `    if (EXOS_ERROR_OK != exos_dataset_init(& ${template.datasets[i].structName}_dataset, & ${template.datamodel.varName}_datamodel, "${template.datasets[i].structName}", & exos_data.${template.datasets[i].structName}, sizeof(exos_data.${template.datasets[i].structName}))) \n`;
        out += `    {\n`;
        out += `        napi_throw_error(env, "EINVAL", "Can't initialize ${template.datasets[i].structName}"); \n`;
        out += `    } \n`;
        out += `    ${template.datasets[i].structName}_dataset.user_context = NULL; \n`;
        out += `    ${template.datasets[i].structName}_dataset.user_tag = 0; \n`;
    }

    // register the datamodel
    out += `\n    if (EXOS_ERROR_OK != exos_datamodel_connect_${template.datamodel.varName}(& ${template.datamodel.varName}_datamodel, datamodelEvent)) \n`;
    out += `    {\n`;
    out += `        napi_throw_error(env, "EINVAL", "Can't connect ${template.datamodel.structName}"); \n`;
    out += `    } \n\n`;

    // register datasets
    for (let i = 0; i < template.datasets.length; i++) {
        out += `    if (EXOS_ERROR_OK != exos_dataset_connect(& ${template.datasets[i].structName}_dataset, `;
        if (template.datasets[i].comment.includes("PUB")) {
            out += `EXOS_DATASET_SUBSCRIBE`;
            if (template.datasets[i].comment.includes("SUB")) {
                out += ` + EXOS_DATASET_PUBLISH`;
            }
        } else {
            out += `EXOS_DATASET_PUBLISH`;
        }
        out += `, datasetEvent)) \n`;
        out += `    {\n`;
        out += `        napi_throw_error(env, "EINVAL", "Can't connect ${template.datasets[i].structName}"); \n`;
        out += `    } \n`;
    }

    out += `\n    uv_idle_init(uv_default_loop(), & cyclic_h); \n`;
    out += `    uv_idle_start(& cyclic_h, cyclic); \n\n`;

    out += `    return exports; \n`;

    out += `} \n\n`;

    return out;
}

function generateLibTemplate(fileName, typName) {
    let out = "";

    let template = configTemplate(fileName, typName);

    //includes, defines, types and global variables
    out += `#define NAPI_VERSION 6\n`;
    out += `#include < node_api.h >\n`;
    out += `#include < stdint.h >\n`;
    out += `#include < exos_api.h >\n`;
    out += `#include "${template.datamodel.varName}_datamodel.h"\n`;
    out += `#include < uv.h >\n`;
    out += `#include < unistd.h >\n`;
    out += `#include < string.h >\n`;
    out += `\n`;
    out += `#define BUR_NAPI_DEFAULT_BOOL_INIT false\n`;
    out += `#define BUR_NAPI_DEFAULT_NUM_INIT 0\n`;
    out += `#define BUR_NAPI_DEFAULT_STRING_INIT ""\n`;
    out += `\n`;
    out += `typedef struct\n`;
    out += `{
        \n`;
    out += `    napi_ref ref; \n`;
    out += `    uint32_t ref_count; \n`;
    out += `    napi_threadsafe_function onchange_cb; \n`;
    out += `    napi_threadsafe_function connectiononchange_cb; \n`;
    out += `    napi_value object_value; //volatile placeholder.\n`;
    out += `    napi_value value;        //volatile placeholder.\n`;
    out += `} obj_handles;\n`;
    out += `\n`;
    out += `obj_handles ${template.datamodel.varName} = {};\n`;
    for (let dataset of template.datasets) {
        out += `obj_handles ${dataset.structName} = {};\n`;
    }
    out += `\n`;
    out += `napi_deferred deferred = NULL;\n`;
    out += `uv_idle_t cyclic_h;\n`;
    out += `\n`;
    out += `${template.datamodel.dataType} exos_data = {};\n`;
    out += `exos_datamodel_handle_t ${template.datamodel.varName}_datamodel;\n`;
    for (let dataset of template.datasets) {
        out += `exos_dataset_handle_t ${dataset.structName}_dataset;\n`;
    }
    out += `\n`;
    out += `// exOS callbacks\n`;

    out += generateExosCallbacks(template);

    out += generateNApiCBinitMMain();

    out += generateConnectionCallbacks(template);

    out += generateValueCallbacks(template);

    out += generateCallbackInits(template);

    out += generateValuesPublishMethods(fileName, template);

    out += generateCleanUpHookCyclic(template);

    out += generateInitFunction(template);

    out += `NAPI_MODULE(NODE_GYP_MODULE_NAME, init_${template.datamodel.varName});\n`;

    return out;
}

function generateJSTemplate(fileName, typName) {
    let out = "";

    //let template = configTemplate(fileName, typName);

    out += `TDB\n`;

    return out;
}

function configTemplate(fileName, typName) {
    var template = {
        headerName: "",
        datamodel: {
            structName: "",
            varName: "",
            dataType: "",
            comment: ""
        },
        datasets: [],
        logname: ""
    }

    if (fs.existsSync(fileName)) {

        var types = header.parseTypFile(fileName, typName);

        template.logname = "logger";
        template.headerName = `exos_${types.attributes.dataType.toLowerCase()}.h`

        template.datamodel.dataType = types.attributes.dataType;
        template.datamodel.structName = types.attributes.dataType;
        //check if toLowerCase is equal to datatype name, then extend it with _datamodel
        if (types.attributes.dataType == types.attributes.dataType.toLowerCase()) {
            template.datamodel.varName = types.attributes.dataType.toLowerCase() + "_datamodel";
        }
        else {
            template.datamodel.varName = types.attributes.dataType.toLowerCase();
        }

        //check if toLowerCase is same as struct name, then extend it with _dataset
        for (let child of types.children) {
            if (child.attributes.name == child.attributes.name.toLowerCase()) {
                let object = {}
                object["structName"] = child.attributes.name;
                object["varName"] = child.attributes.name.toLowerCase() + "_dataset";
                object["dataType"] = child.attributes.dataType;
                object["arraySize"] = child.attributes.arraySize;
                object["comment"] = child.attributes.comment;
                if (child.attributes.hasOwnProperty("stringLength")) { object["stringLength"] = child.attributes.stringLength; }
                template.datasets.push(object);
            }
            else {
                let object = {}
                object["structName"] = child.attributes.name;
                object["varName"] = child.attributes.name.toLowerCase();
                object["dataType"] = child.attributes.dataType;
                object["arraySize"] = child.attributes.arraySize;
                object["comment"] = child.attributes.comment;
                if (child.attributes.hasOwnProperty("stringLength")) { object["stringLength"] = child.attributes.stringLength; }
                template.datasets.push(object);
                ;
            }
        }

        // initialize non-string comments to "" and missing arraysizes to 0
        for (let dataset of template.datasets) {
            if (typeof dataset.comment !== 'string') {
                dataset.comment = "";
            }
            if (typeof dataset.arraySize !== 'number') {
                dataset.arraySize = 0;
            }
        }

    } else {
        throw (`file '${fileName}' not found.`);
    }

    return template;
}

if (require.main === module) {
    if (process.argv.length > 3) {
        let outPath = process.argv[4];
        if (outPath == "" || outPath == undefined) {
            outPath = ".";
        }
        let fileName = process.argv[2];
        let structName = process.argv[3];

        try {
            let out = generateTemplate(fileName, structName);
            fs.writeFileSync(`${outPath}/exos_template_${structName.toLowerCase()}_linux.c`, out);
            process.stdout.write(`${outPath}/exos_template_${structName.toLowerCase()}_linux.c generated`);
        } catch (error) {
            process.stderr.write(error);
        }
    }
    else {
        process.stderr.write(" - usage: ./exos_template_linux.js <filename.typ> <structname> <template output folder>\n");
    }
}

module.exports = {
    generateExosPkg,
    generateLinuxPackage,
    generateLibTemplate,
    generateJSTemplate,
    generateShBuild
}
