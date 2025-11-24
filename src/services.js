import {ENDPOINTS, FORMATS} from "./config.js";

/**
 * Calls the grid generator endpoint and returns:
 * { xmlString, resolutionFactor }
 */
export async function fetchGrid({
                                    rows = 3,
                                    cols = 3,
                                    stepX = 1.0,
                                    stepY = 1.0,
                                    format = FORMATS.xml,
                                    signal,
                                }) {
    // Query params (server expects rows/cols/format)
    const query = qs({rows, cols, format});

    // POST body (server expects step sizes and origin)
    const body = {
        x: 0,
        y: 0,
        stepSizeX: stepX,
        stepSizeY: stepY,
    };

    const url = `${ENDPOINTS.generateBiGrid}?${query}`;
    const json = await postJson(url, body, {signal});

    // Normalize names for the caller
    return {
        xmlString: json?.content ?? "",
        resolutionFactor: json?.resolutionFactor ?? 1,
        raw: json,
    };
}

/**
 * Connects to the CDO service and returns either text (xml/protobuf) or JSON.
 *
 * @param {Object} opts
 * @param {string} opts.address - "host:port" (e.g., "127.0.0.1:2036")
 * @param {string} opts.repoPath - e.g., "/repo1/system"
 * @param {boolean} [opts.coordAsLinks=false]
 * @param {"xml"|"json"|"protobuf"} [opts.format="xml"]
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<string|any>} XML/Proto as text, or JSON object
 */
export async function fetchCdoModel({
                                        address,
                                        repoPath,
                                        format = FORMATS.xml, // keep "xml" so server returns XML in the content field
                                        signal,
                                    }) {
    const url = `${ENDPOINTS.cdo}?${qs({
        address,
        repopath: repoPath, // backend expects "repopath"
        format,
    })}`;

    const json = await getJson(url, { signal });
    return {
        xmlString: json?.content ?? "",
        resolutionFactor: json?.resolutionFactor ?? 1,
        raw: json,
    };
}

/**
 * Query builder helper
 * @param params
 * @returns {string}
 */
export function qs(params) {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
        if (v === undefined || v === null) return;
        // Encode booleans explicitly to avoid "on"/"off"
        search.set(k, typeof v === "boolean" ? String(v) : String(v));
    });
    return search.toString();
}

/**
 * Basic GET wrapper with consistent error handling.
 * Add auth headers or credentials here if needed later.
 */
export async function httpGet(url, {signal} = {}) {
    const res = await fetch(url, {signal});
    if (!res.ok) {
        // Surface a concise error with enough context
        const text = await safeReadText(res);
        throw new Error(`HTTP ${res.status} ${res.statusText} @ ${res.url} :: ${truncate(text, 200)}`);
    }
    return res;
}

export async function postJson(url, body, { signal, headers = {} } = {}) {
    const res = await fetch(url, {
        method: "POST",
        signal,
        headers: {
            "Content-Type": "application/json",
            ...headers,
        },
        body: JSON.stringify(body ?? {}),
    });
    if (!res.ok) {
        const text = await safeReadText(res);
        throw new Error(`HTTP ${res.status} ${res.statusText} @ ${res.url} :: ${truncate(text, 200)}`);
    }
    return res.json();
}

/** Convenience helpers for common payloads */
export async function getText(url, opts) {
    const res = await httpGet(url, opts);
    return res.text();
}

export async function getJson(url, opts) {
    const res = await httpGet(url, opts);
    return res.json();
}

/** Utilities (internal) */
async function safeReadText(res) {
    try {
        return await res.text();
    } catch {
        return "<no body>";
    }
}

function truncate(s, n) {
    return s && s.length > n ? s.slice(0, n) + "…" : s;
}
