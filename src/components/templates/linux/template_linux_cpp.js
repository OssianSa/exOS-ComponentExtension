/*
 * Copyright (C) 2021 B&R Danmark
 * All rights reserved
 * 
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

const { Datamodel, GeneratedFileObj } = require('../../../datamodel');
const { Template, ApplicationTemplate } = require('../template')
const { TemplateLinuxTermination } = require('./template_linux_termination');
const { TemplateCppLib } = require('../template_cpp_lib');

class TemplateLinuxCpp extends TemplateCppLib {

    /**
     * @type {TemplateLinuxTermination}
     */
    termination;

    /**
     * main sourcefile for the application
     * @type {GeneratedFileObj}
     */
    mainSource;

     /**
     * {@linkcode TemplateARCpp} Generate source code for Linux C++ application
     * 
     * Generates following {@link GeneratedFileObj}
     * - {@linkcode mainSource}
     * 
     * Inherited from {@linkcode TemplateCppLib}
     * - {@linkcode datasetHeader} dataset class
     * - {@linkcode loggerHeader} datalogger class
     * - {@linkcode loggerSource} datalogger class implementation
     * - {@linkcode datamodelHeader} datamodel class
     * - {@linkcode datamodelSource} datamodel class implementation
     * 
     * Using {@linkcode TemplateLinuxTermination}:
     * - `termination.terminationHeader` termination handling header
     * - `termination.terminationSource` termination handling source code
     * 
     * @param {Datamodel} datamodel
     */
    constructor(datamodel) {
        /**
         * @param {ApplicationTemplate} template 
         * @param {string} legend
         * @param {string} terminationHeaderName
         */
        function _generateMainLinux(template, legend, terminationHeaderName) {
            let out = "";
        
            out += `#include <string>\n`;
            out += `#include <csignal>\n`;
            out += `#include "${template.datamodel.className}.hpp"\n`;
            out += `#include "${terminationHeaderName}"\n`;
            out += `\n`;
            out += legend;
            out += `\n\n`;
            out += `int main(int argc, char ** argv)\n`;
            out += `{\n`;            
            out += `    catch_termination();\n`;
            out += `    \n`;
            out += `    ${template.datamodel.className} ${template.datamodel.varName};\n`;
            out += `    ${template.datamodel.varName}.connect();\n`;
            out += `    \n`;
            out += `    ${template.datamodel.varName}.onConnectionChange([&] () {\n`;
            out += `        if (${template.datamodel.varName}.connectionState == EXOS_STATE_CONNECTED) {\n`;
            out += `            // Datamodel connected\n`;
            out += `        }\n`;
            out += `        else if (${template.datamodel.varName}.connectionState == EXOS_STATE_DISCONNECTED) {    \n`;
            out += `            // Datamodel disconnected\n`;
            out += `        }\n`;
            out += `    });\n`;
            out += `\n`;
            for (let dataset of template.datasets) {
                if (dataset.isSub) {
                    out += `    ${template.datamodel.varName}.${dataset.structName}.onChange([&] () {\n`;
                    out += `        // ${template.datamodel.varName}.${dataset.structName}.value ...\n`;
                    out += `    });\n`;
                    out += `\n`;
                }
            }
            out += `\n`;
            out += `    while(!is_terminated()) {\n`;
            out += `        // trigger callbacks\n`;
            out += `        ${template.datamodel.varName}.process();\n`;
            out += `        \n`;
            out += `        // publish datasets\n`;
            out += `        \n`;
            out += `        if (${template.datamodel.varName}.isConnected) {\n`;
            for (let dataset of template.datasets) {
                if (dataset.isPub) {
                    out += `            // ${template.datamodel.varName}.${dataset.structName}.value = ...\n`;
                    out += `            // ${template.datamodel.varName}.${dataset.structName}.publish();\n`;
                    out += `            \n`;
                }
            }
            out += `        }\n`;
            out += `    }\n`;
            out += `\n`;
            out += `    return 0;\n`;
            out += `}\n`;
        
            return out;
        }
        /**
         * @param {ApplicationTemplate} template 
         * @param {string} legend
         * @param {string} terminationHeaderName
         */
         function _generateMainLinuxNoDatamodel(terminationHeaderName) {
            let out = "";
        
            out += `#include <string>\n`;
            out += `#include <csignal>\n`;
            out += `#include "${terminationHeaderName}"\n\n`;
            
            out += `int main(int argc, char ** argv)\n`;
            out += `{\n`;
            out += `    catch_termination();\n\n`;

            out += `    while(!is_terminated()) {\n`;
            out += `        //put your cyclic code here!\n`;
            out += `    }\n\n`;

            out += `    return 0;\n`;
            out += `}\n`;
        
            return out;
        }
        
        
        super(datamodel,true);
        this.termination = new TemplateLinuxTermination();
        if (datamodel == undefined) {
            this.mainSource = {name:`main.cpp`, contents:_generateMainLinuxNoDatamodel(this.termination.terminationHeader.name), description:"Linux application"};
        }
        else {
            this.mainSource = {name:`${this.datamodel.typeName.toLowerCase()}.cpp`, contents:_generateMainLinux(this.template,this.datamodelLegend,this.termination.terminationHeader.name), description:"Linux application"};
        }

    }

}

module.exports = {TemplateLinuxCpp};