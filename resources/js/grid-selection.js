/**
 * Spreadsheet-style rectangular range selection + copy/paste for any <table
 * data-grid> whose body rows carry [data-row-id] and whose editable cells
 * carry [data-field] (see resources/views/tasks/partials/_row.blade.php).
 *
 * - Click still opens a single cell for editing (unchanged, handled by Alpine
 *   in _cell.blade.php) as long as the mouse doesn't move between cells.
 * - Drag, or Shift+click, selects a rectangular range instead and suppresses
 *   that click's "open for editing" behavior.
 * - Ctrl/Cmd+C copies the selected range's displayed values as TSV.
 * - Ctrl/Cmd+V pastes TSV from the clipboard starting at the selection's
 *   top-left cell, clipped to the rows/columns currently on screen (it never
 *   creates new rows), by PATCHing each affected cell through the existing
 *   per-cell endpoint and swapping in the server's response — the same
 *   validation and audit logging as a normal single-cell edit applies.
 */
export function setupGridSelection() {
    const table = document.querySelector('table[data-grid]');
    if (!table) {
        return;
    }

    let anchorCell = null;
    let isSelecting = false;
    let dragMoved = false;
    let currentRange = null;

    const getRows = () => [...table.querySelectorAll('tbody > tr[data-row-id]')];
    const getCells = (row) => [...row.querySelectorAll('td[data-field]')];

    function cellPosition(td) {
        const row = td.closest('tr');
        const rows = getRows();
        const rowIndex = rows.indexOf(row);
        const colIndex = getCells(row).indexOf(td);

        return rowIndex === -1 || colIndex === -1 ? null : { rowIndex, colIndex };
    }

    function clearHighlight() {
        table.querySelectorAll('.grid-cell-selected').forEach((el) => el.classList.remove('grid-cell-selected'));
    }

    function highlightRange(a, b) {
        clearHighlight();

        const rows = getRows();
        const range = {
            rowStart: Math.min(a.rowIndex, b.rowIndex),
            rowEnd: Math.max(a.rowIndex, b.rowIndex),
            colStart: Math.min(a.colIndex, b.colIndex),
            colEnd: Math.max(a.colIndex, b.colIndex),
        };

        for (let r = range.rowStart; r <= range.rowEnd; r++) {
            const cells = getCells(rows[r]);
            for (let c = range.colStart; c <= range.colEnd; c++) {
                cells[c]?.classList.add('grid-cell-selected');
            }
        }

        return range;
    }

    table.addEventListener('mousedown', (event) => {
        const td = event.target.closest('td[data-field]');
        if (!td) {
            return;
        }

        const pos = cellPosition(td);
        if (!pos) {
            return;
        }

        if (event.shiftKey && anchorCell) {
            currentRange = highlightRange(anchorCell, pos);
            event.preventDefault();
            return;
        }

        anchorCell = pos;
        isSelecting = true;
        dragMoved = false;
        currentRange = highlightRange(pos, pos);
    });

    table.addEventListener('mousemove', (event) => {
        if (!isSelecting) {
            return;
        }

        const td = event.target.closest('td[data-field]');
        if (!td) {
            return;
        }

        const pos = cellPosition(td);
        if (!pos) {
            return;
        }

        if (pos.rowIndex !== anchorCell.rowIndex || pos.colIndex !== anchorCell.colIndex) {
            dragMoved = true;
        }

        currentRange = highlightRange(anchorCell, pos);
    });

    document.addEventListener('mouseup', () => {
        isSelecting = false;
    });

    // Capture phase, so this runs before Alpine's own bubbling @click handler
    // that would otherwise open the cell the drag ended on for editing.
    table.addEventListener('click', (event) => {
        if (dragMoved) {
            event.stopPropagation();
            event.preventDefault();
            dragMoved = false;
        }
    }, true);

    document.addEventListener('keydown', (event) => {
        const metaOrCtrl = event.metaKey || event.ctrlKey;
        if (!metaOrCtrl || !currentRange) {
            return;
        }

        const active = document.activeElement;
        if (active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)) {
            // A cell is actively being edited: let the browser's native
            // copy/paste work on that field instead of the grid-level one.
            return;
        }

        if (event.key === 'c' || event.key === 'C') {
            copySelection(currentRange);
        } else if (event.key === 'v' || event.key === 'V') {
            event.preventDefault();
            pasteSelection(currentRange);
        }
    });

    function cellDisplayText(td) {
        const span = td.querySelector('span');
        // A real newline inside a cell (e.g. multi-line notes) would corrupt
        // the TSV row/column structure, so flatten it to a space.
        return (span?.innerText ?? '').replace(/\r?\n/g, ' ').trim();
    }

    async function copySelection(range) {
        const rows = getRows();
        const lines = [];

        for (let r = range.rowStart; r <= range.rowEnd; r++) {
            const cells = getCells(rows[r]);
            const values = [];
            for (let c = range.colStart; c <= range.colEnd; c++) {
                values.push(cellDisplayText(cells[c]));
            }
            lines.push(values.join('\t'));
        }

        try {
            await navigator.clipboard.writeText(lines.join('\n'));
        } catch {
            // Clipboard access can be denied (permissions, insecure context);
            // there's nothing useful to do but leave the selection as-is.
        }
    }

    function resolveAssigneeId(td, name) {
        if (name === '') {
            return '';
        }

        // The <select> for this cell is always rendered (just hidden while
        // not editing), so its options are the live list of assignee names.
        const select = td.querySelector('select[name="value"]');
        if (!select) {
            return name;
        }

        const match = [...select.options].find((option) => option.textContent.trim() === name.trim());

        // Fall back to the raw pasted text if there's no matching assignee;
        // the server's exists:assignees,id rule will reject it with a normal
        // validation error shown on that cell, same as any other bad paste.
        return match ? match.value : name;
    }

    async function pasteSelection(range) {
        let text;
        try {
            text = await navigator.clipboard.readText();
        } catch {
            return;
        }

        const pasteRows = text.replace(/\r/g, '').split('\n');
        if (pasteRows.length > 1 && pasteRows[pasteRows.length - 1] === '') {
            pasteRows.pop();
        }

        const rows = getRows();
        if (rows.length === 0) {
            return;
        }

        const columnFields = getCells(rows[0]).map((td) => td.dataset.field);
        const token = document.querySelector('meta[name="csrf-token"]')?.content;

        for (let r = 0; r < pasteRows.length; r++) {
            const rowIndex = range.rowStart + r;
            if (rowIndex >= rows.length) {
                break;
            }

            const pasteCols = pasteRows[r].split('\t');
            const cells = getCells(rows[rowIndex]);

            for (let c = 0; c < pasteCols.length; c++) {
                const colIndex = range.colStart + c;
                if (colIndex >= columnFields.length) {
                    break;
                }

                const td = cells[colIndex];
                const field = columnFields[colIndex];
                const rowId = rows[rowIndex].dataset.rowId;
                const value = field === 'assignee_id' ? resolveAssigneeId(td, pasteCols[c]) : pasteCols[c];

                const response = await fetch(`/tasks/${rowId}/cells/${field}`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'X-CSRF-TOKEN': token ?? '',
                        'X-Requested-With': 'XMLHttpRequest',
                    },
                    body: `value=${encodeURIComponent(value)}`,
                });

                if (response.ok) {
                    td.innerHTML = await response.text();
                }
            }
        }
    }
}
