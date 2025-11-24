/**
 * *********************************************************************************************************************
 * Bigraph XMI Parser Functions
 * *********************************************************************************************************************
 */

/**
 * Parse a bigraph XMI file (i.e., a bigrid) containing potentially multiple roots.
 *
 * This function handles multi-root XMI models, where each root may
 * represent a distinct product of BiGridFactory elements. The XML is
 * parsed and normalized into a common data structure used by the
 * rendering pipeline.
 *
 * The argument `coordinatesAsLinks` indicates whether to use the outer names or CO-typed nodes to extract the
 * coordinates encoded in a Locale.
 *
 * @param {string} xmlString XMI source as a string.
 * @param {boolean} [coordinatesAsLinks=true] - Interpret coordinates as link edges.
 * @returns {Object} Parsed bigraph model (cells, links).
 */
export function parseBigraphXML(xmlString, coordinatesAsLinks = true) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "application/xml");

    const nsResolver = (prefix) => {
        const ns = {
            bigraphBaseModel: "http://org.bigraphs.model",
            xmi: "http://www.omg.org/XMI",
            xsi: "http://www.w3.org/2001/XMLSchema-instance"
        };
        return ns[prefix] || null;
    };

    // XPath to select all <bRoots> elements (note: they are unprefixed)
    const xpathExpr = "//*[local-name()='bRoots']";
    const bRootsResult = xmlDoc.evaluate(xpathExpr, xmlDoc, nsResolver, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    console.log("bRootsResult", bRootsResult)
    const outerNamesResult = xmlDoc.evaluate("//*[local-name()='bOuterNames']", xmlDoc, nsResolver, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    console.log("outerNamesResult", outerNamesResult);

    const outerNames = [];
    for (let i = 0; i < outerNamesResult.snapshotLength; i++) {
        const outerNameElement = outerNamesResult.snapshotItem(i);
        const name = outerNameElement.getAttribute("name");
        outerNames.push(name);
    }
    console.log("outerNames", outerNames);
    const cells = [];
    let localeRootIndex = 0;
    // Now extract each bChild of type "bigraphBaseModel:Locale" and its corresponding bPorts
    for (let i = 0; i < bRootsResult.snapshotLength; i++) {
        const bRoot = bRootsResult.snapshotItem(i);

        // Find all bChild elements inside the current bRoot
        const bChildren = bRoot.getElementsByTagNameNS("", "bChild");


        const bChild = bChildren[0];
        // Check if this bChild is a Locale type (xsi:type="bigraphBaseModel:Locale")
        const xsiType = bChild.getAttribute("xsi:type");
        if (xsiType && xsiType.includes("bigraphBaseModel:Locale")) {
            const locName = bChild.getAttribute("name");

            // const res = extractLocalePortPoint(bChild, outerNames, /* preferredIndex: */ 4, parseParamControl);
            // if (res) {
            //     // console.log(
            //     //     `Locale: ${locName}, OuterName[${res.index}]="${res.outerName}", portIndex=${res.portIndex}, bLink="${res.bLink}", X,Y=[${res.point.x} | ${res.point.y}]`
            //     // );
            //     cells.push({index: res.index, locale: locName, point: res.point});
            // }


            // use outernames to retrieve coordinates
            if (coordinatesAsLinks === true) {
                // Now find all bPorts for this Locale
                const res = extractLocalePortPoint(bChild, outerNames, /* preferredIndex: */ 4, parseParamControl);
                if (res) {
                    // console.log(
                    //     `Locale: ${locName}, OuterName[${res.index}]="${res.outerName}", portIndex=${res.portIndex}, bLink="${res.bLink}", X,Y=[${res.point.x} | ${res.point.y}]`
                    // );
                    cells.push({index: res.index, locale: locName, point: res.point});
                }
            }
            const bCoordChild = bChild.getElementsByTagNameNS("", "bChild");
            for (let i = 0; i < bCoordChild.length; i++) {
                const bChildCoord = bCoordChild[i];
                const xsiTypePorts = bChildCoord.getAttribute("xsi:type");
                if (coordinatesAsLinks === false) {
                    if (xsiTypePorts && xsiTypePorts.includes("bigraphBaseModel:CO")) {
                        const coordNode = bChildCoord.getElementsByTagNameNS("", "bChild")[0];
                        const result = coordNode.getAttribute("xsi:type").split(":")[1];
                        const point = parseParamControl(result);
                        cells.push({
                            index: localeRootIndex++,
                            locale: locName,
                            point: point
                        });
                    }
                }
            }
        }
    }

    const linkMap = new Map();
    //TODO
    return {cells, linkMap};
}

/**
 *This parser handles a bigrid XMI encoding that has only a single root.
 *
 * It extracts cells and link information required by the rendering pipeline.
 *
 * The argument `coordinatesAsLinks` indicates whether to use the outer names or CO-typed nodes to extract the
 * coordinates encoded in a Locale.
 *
 * @param {string} xmlString - The XML source to parse.
 * @param {boolean} [coordinatesAsLinks=false] - Interpret coordinates as link edges.
 * @returns {{ cells: Array, linkMap: Object }} Parsed cell data and link structure
 */
export function parseBigraphXML_singleBRoot(xmlString, coordinatesAsLinks = false) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "application/xml");

    const nsResolver = (prefix) => {
        const ns = {
            bigraphBaseModel: "http://org.bigraphs.model",
            xmi: "http://www.omg.org/XMI",
            xsi: "http://www.w3.org/2001/XMLSchema-instance"
        };
        return ns[prefix] || null;
    };

    // XPath to select all <bRoots> elements (note: they are unprefixed)
    const xpathExpr = "//*[local-name()='bRoots']";
    const bRootsResult = xmlDoc.evaluate(xpathExpr, xmlDoc, nsResolver, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    console.log("bRootsResult=", bRootsResult)

    const outerNamesResult = xmlDoc.evaluate("//*[local-name()='bOuterNames']", xmlDoc, nsResolver, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    console.log("outerNamesResult:", outerNamesResult);
    const outerNames = [];
    for (let i = 0; i < outerNamesResult.snapshotLength; i++) {
        const outerNameElement = outerNamesResult.snapshotItem(i);
        const name = outerNameElement.getAttribute("name");
        outerNames.push(name); // Store the name
    }
    console.log("outerNames:", outerNames);

    const cells = [];

    const bRoot = bRootsResult.snapshotItem(0);
    console.log("Single bRoot", bRoot);

    // Find all bChild elements inside the current bRoot
    const bChildren = bRoot.getElementsByTagNameNS("", "bChild");

    let localRootIndex = 0;
    for (let ix = 0; ix < bChildren.length; ix++) {
        const bChild = bChildren[ix];
        // Check if this bChild is a Locale type (xsi:type="bigraphBaseModel:Locale")
        const xsiType = bChild.getAttribute("xsi:type");
        if (xsiType && xsiType.includes("bigraphBaseModel:Locale")) {
            const locName = bChild.getAttribute("name");
            const bCoordChild = bChild.getElementsByTagNameNS("", "bChild");

            // use outer names to retrieve coordinates
            if (coordinatesAsLinks === true) {
                // Now find all bPorts for this Locale
                const res = extractLocalePortPoint(bChild, outerNames, /* preferredIndex: */ 4, parseParamControl);
                if (res) {
                    // console.log(
                    //     `Locale: ${locName}, OuterName[${res.index}]="${res.outerName}", portIndex=${res.portIndex}, bLink="${res.bLink}", X,Y=[${res.point.x} | ${res.point.y}]`
                    // );
                    cells.push({index: res.index, locale: locName, point: res.point});
                }
            }
            for (let i = 0; i < bCoordChild.length; i++) {
                const bChildCoord = bCoordChild[i];
                const xsiTypePorts = bChildCoord.getAttribute("xsi:type");
                if (coordinatesAsLinks === false) {
                    if (xsiTypePorts && xsiTypePorts.includes("bigraphBaseModel:CO")) {
                        const coordNode = bChildCoord.getElementsByTagNameNS("", "bChild")[0];
                        const result = coordNode.getAttribute("xsi:type").split(":")[1];
                        const point = parseParamControl(result);
                        cells.push({
                            index: localRootIndex++,
                            locale: locName,
                            point: point
                        });
                    }
                }
            }
        }
    }

    const linkMap = new Map();
    //TODO
    return {cells, linkMap};
}


/**
 * *********************************************************************************************************************
 * Helper Functions
 * *********************************************************************************************************************
 */

/**
 * Extract outer-name index and point from a Locale's <bPorts>.
 * Falls back gracefully if the preferred index is missing.
 *
 * @param {Element} bChild - the <bChild xsi:type="bigraphBaseModel:Locale"> element
 * @param {string[]} outerNames - array of outer names (by index)
 * @param {number|null} preferredIndex - optional preferred port index (e.g. 4)
 * @param {(name:string)=>{x:number,y:number}} parseParamControl - your existing parser
 * @returns {{index:number, point:{x:number,y:number}, outerName:string, bLink:string, portIndex:number} | null}
 */
function extractLocalePortPoint(bChild, outerNames, preferredIndex = null, parseParamControl) {
    const bPorts = bChild.getElementsByTagNameNS("", "bPorts");
    if (!bPorts || bPorts.length === 0) return null;

    // try preferred index if given, else first with a valid bLink
    let chosen = null;
    if (preferredIndex != null && bPorts[preferredIndex]) {
        chosen = bPorts[preferredIndex];
    } else {
        chosen = Array.from(bPorts).find(p => p.hasAttribute("bLink"));
    }
    if (!chosen) return null;

    const bLink = chosen.getAttribute("bLink") || "";
    const match = /bOuterNames\.(\d+)/.exec(bLink);
    if (!match) return null;

    const idx = Number(match[1]);
    const outerName = outerNames[idx];
    if (outerName == null) return null;

    const point = parseParamControl(outerName);
    return {
        index: idx,
        point,
        outerName,
        bLink,
        portIndex: Array.prototype.indexOf.call(bPorts, chosen)
    };
}

function parseParamControl(formattedString) {
    if (
        typeof formattedString !== "string" ||
        !formattedString.startsWith("C_") ||
        !formattedString.includes("__")
    ) {
        throw new Error("Invalid format");
    }

    try {
        const parts = formattedString.substring(2).split("__");

        const xString = parts[0].replace(/N/g, "-").replace(/_/g, ".");
        const yString = parts[1].replace(/N/g, "-").replace(/_/g, ".");

        const x = parseFloat(xString);
        const y = parseFloat(yString);

        if (isNaN(x) || isNaN(y)) {
            throw new Error("Invalid number format");
        }

        return {x, y}; // similar to Point2D.Float in structure
    } catch (e) {
        throw new Error("Invalid format: " + e.message);
    }
}