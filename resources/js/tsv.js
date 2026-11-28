/**
 * TSV as Google Sheets / Excel put it on (and read it from) the clipboard:
 * cells separated by tabs, rows by newlines, and a cell containing a tab,
 * newline or double quote wrapped in double quotes with "" for each quote.
 */

/** @param {string[][]} rows */
export function formatTsv(rows) {
    return rows
        .map((row) => row.map((value) => (/[\t\n\r"]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)).join('\t'))
        .join('\n');
}

/**
 * @param {string} text
 * @returns {string[][]} one array of cell strings per row (rows may differ in length)
 */
export function parseTsv(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let i = 0;
    let atCellStart = true;

    const endCell = () => {
        row.push(cell);
        cell = '';
        atCellStart = true;
    };
    const endRow = () => {
        endCell();
        rows.push(row);
        row = [];
    };

    while (i < text.length) {
        const ch = text[i];

        if (atCellStart && ch === '"') {
            // Quoted cell: read up to the closing quote; "" is a literal quote.
            let j = i + 1;
            let quoted = '';
            let closed = false;
            while (j < text.length) {
                if (text[j] === '"') {
                    if (text[j + 1] === '"') {
                        quoted += '"';
                        j += 2;
                        continue;
                    }
                    closed = true;
                    j++;
                    break;
                }
                quoted += text[j];
                j++;
            }
            const next = text[j];
            if (closed && (j >= text.length || next === '\t' || next === '\n' || next === '\r')) {
                cell = quoted;
                i = j;
                atCellStart = false;
                continue;
            }
            // Not a well-formed quoted cell (e.g. `"abc` or `"a"b`): take the
            // quote literally, as the spreadsheets do.
        }

        atCellStart = false;
        if (ch === '\t') {
            endCell();
        } else if (ch === '\r' && text[i + 1] === '\n') {
            endRow();
            i++;
        } else if (ch === '\n' || ch === '\r') {
            endRow();
        } else {
            cell += ch;
        }
        i++;
    }

    // A trailing newline (Excel always adds one) doesn't start another row.
    if (!(atCellStart && row.length === 0 && rows.length > 0)) {
        endRow();
    }

    return rows;
}
