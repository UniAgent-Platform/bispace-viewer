export const DEFAULT_GRID = Object.freeze({
    rows: 5,
    cols: 5,
    stepX: 0.5,
    stepY: 0.5,
});

/**
 * Central API endpoints.
 */
export const ENDPOINTS = Object.freeze({
    cdo: "/fetch/cdo",
    generateBiGrid: "/generate/bigrid",
});

/** Allowed response formats */
export const FORMATS = Object.freeze({
    xml: "xml",
    json: "json",
    protobuf: "protobuf",
});
