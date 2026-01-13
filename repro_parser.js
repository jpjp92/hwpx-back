
import { XMLParser, XMLBuilder } from 'fast-xml-parser';

const xmlSnippet = `
<hp:p>
    <hp:tab width="1600" />
</hp:p>
`;

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    preserveOrder: true,
    trimValues: false,
    parseTagValue: false
});

const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    preserveOrder: true,
    format: false,
    suppressEmptyNode: true, // New config
});

const jsonObj = parser.parse(xmlSnippet);
const builtXml = builder.build(jsonObj);
console.log("Built:   ", builtXml);
