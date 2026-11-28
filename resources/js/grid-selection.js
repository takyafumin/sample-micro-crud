/**
 * Spreadsheet-style rectangular range selection + copy/paste for any <table
 * data-grid> whose body rows carry [data-row-id] and whose editable cells
 * carry [data-field] (see resources/views/tasks/partials/_row.blade.php).
 *
 * - A click anywhere in a cell (text or padding) opens it for editing with
 *   the field focused, as long as the mouse doesn't move between cells.
 * - Drag, or Shift+click, selects a rectangular range instead and suppresses
 *   that click's "open for editing" behavior.
 * - Keyboard, as in a spreadsheet (only after the last click landed on a
 *   grid cell, and never while the user is typing into a focused text
 *   field — after a click opens a cell, press Escape to get back to grid
 *   navigation; a focused select is the exception, see focusedCellSelect):
 *   Arrow moves the active cell and collapses the selection to it;
 *   Shift+Arrow keeps the active cell (anchor) fixed and grows/shrinks the
 *   range's opposite corner one cell at a time; Ctrl/Cmd+Arrow and
 *   Ctrl/Cmd+Shift+Arrow do the same but jump straight to the table's edge.
 *   A cell editor left open without focus is closed as if Escape were
 *   pressed, so the highlight never moves away from a still-open editor.
 * - Enter opens the active cell for editing with its field focused; Escape
 *   cancels an open edit (restores the original value and closes it).
 * - Only one cell is in edit mode at a time: opening a cell closes the others.
 * - Ctrl/Cmd+C copies the selected range's displayed values as TSV, unless
 *   the browser already has a native text selection (then that's copied
 *   instead, as the user would expect anywhere else on the page).
 * - Ctrl/Cmd+V pastes TSV from the clipboard starting at the selection's
 *   top-left cell, clipped to the rows/columns currently on screen (it never
 *   creates new rows), by PATCHing each affected cell through the existing
 *   per-cell endpoint and swapping in the server's response — the same
 *   validation and audit logging as a normal single-cell edit applies.
 * - The selection is dropped whenever htmx swaps anything inside the table
 *   (search, add, delete), since row/column positions are plain DOM indices
 *   and would otherwise silently point at different tasks after a swap.
 */
export function setupGridSelection() {
    const table = document.querySelector('table[data-grid]');
    if (!table || table.dataset.gridSelectionReady) {
        return;
    }
    table.dataset.gridSelectionReady = 'true';

    // anchorCell is the active cell (where the selection started, stays
    // fixed while extending); focusCell is the range's opposite corner, the
    // one Shift+Arrow / Shift+click / drag moves.
    let anchorCell = null;
    let focusCell = null;
    let isSelecting = false;
    let dragMoved = false;
    let currentRange = null;
    // Arrow keys belong to the grid only while the user is "in" it; after a
    // click or focus elsewhere they go back to scrolling the page as usual.
    let keyboardActive = false;
    let pasteInFlight = false;

    const getRows = () => [...table.querySelectorAll('tbody > tr[data-row-id]')];
    const getCells = (row) => [...row.querySelectorAll('td[data-field]')];

    function cellPosition(td) {
        const row = td.closest('tr');
        const rows = getRows();
        const rowIndex = rows.indexOf(row);
        const colIndex = getCells(row).indexOf(td);

        return rowIndex === -1 || colIndex === -1 ? null : { rowIndex, colIndex };
    }

    function cellAt(pos) {
        const row = getRows()[pos.rowIndex];
        return row ? getCells(row)[pos.colIndex] ?? null : null;
    }

    function clearSelection() {
        anchorCell = null;
        focusCell = null;
        currentRange = null;
        table.querySelectorAll('.grid-cell-selected, .grid-cell-active').forEach((el) => {
            el.classList.remove('grid-cell-selected', 'grid-cell-active');
        });
    }

    /** Runs callback(td, rowIndex, colIndex) for every cell in range that still exists. */
    function forEachCellInRange(range, callback) {
        const rows = getRows();
        for (let r = range.rowStart; r <= range.rowEnd; r++) {
            const cells = getCells(rows[r]);
            if (!cells.length) {
                continue;
            }
            for (let c = range.colStart; c <= range.colEnd; c++) {
                if (cells[c]) {
                    callback(cells[c], r, c);
                }
            }
        }
    }

    function highlightRange(a, b) {
        table.querySelectorAll('.grid-cell-selected, .grid-cell-active').forEach((el) => {
            el.classList.remove('grid-cell-selected', 'grid-cell-active');
        });

        const range = {
            rowStart: Math.min(a.rowIndex, b.rowIndex),
            rowEnd: Math.max(a.rowIndex, b.rowIndex),
            colStart: Math.min(a.colIndex, b.colIndex),
            colEnd: Math.max(a.colIndex, b.colIndex),
        };

        forEachCellInRange(range, (td) => td.classList.add('grid-cell-selected'));
        cellAt(a)?.classList.add('grid-cell-active');
        focusCell = { rowIndex: b.rowIndex, colIndex: b.colIndex };

        return range;
    }

    // A search (swaps #task-rows) or a delete (swaps a <tr>) can shift,
    // remove, or reorder rows; row/col positions are plain indices, so a
    // selection made before either swap could silently point at different
    // tasks after it. An ordinary single-cell edit (swaps just that <td>'s
    // innerHTML) doesn't change row order/count, so it's deliberately left
    // alone — otherwise editing one cell would clear the whole selection.
    // Listening "before" (while the target is still attached and so still
    // bubbles up to here) rather than "after" matters for delete: its
    // outerHTML-to-empty swap detaches the target, and a detached element's
    // afterSwap event would never reach this document-level listener.
    document.body.addEventListener('htmx:beforeSwap', (event) => {
        const target = event.detail.target;
        if (table.contains(target) && (target.id === 'task-rows' || target.tagName === 'TR')) {
            clearSelection();
        }
    });

    table.addEventListener('mousedown', (event) => {
        // Let a mousedown inside the cell's own editing control (positioning
        // the cursor, selecting text to retype) behave natively instead of
        // re-arming the grid selection around the cell being edited.
        if (event.target.closest('input, textarea, select')) {
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

        keyboardActive = true;
        if (event.shiftKey && anchorCell) {
            // preventDefault below keeps focus where it is, which after a
            // click is the first cell's editor; Ctrl/Cmd+C/V and Shift+Arrow
            // would then act on that field instead of the range. Hand focus
            // back to the grid: blurring commits any typed change (change ->
            // PATCH), then the now-unfocused editor is closed.
            releaseFocusedCellEditor();
            closeOtherEditors();
            currentRange = highlightRange(anchorCell, pos);
            dragMoved = true; // suppress this click's own edit-open too
            event.preventDefault();
            return;
        }

        keyboardActive = true;
        anchorCell = pos;
        isSelecting = true;
        dragMoved = false;
        table.classList.add('grid-dragging');
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
        if (!pos || (pos.rowIndex === currentRange?.lastRow && pos.colIndex === currentRange?.lastCol)) {
            return;
        }

        if (pos.rowIndex !== anchorCell.rowIndex || pos.colIndex !== anchorCell.colIndex) {
            dragMoved = true;
        }

        currentRange = highlightRange(anchorCell, pos);
        currentRange.lastRow = pos.rowIndex;
        currentRange.lastCol = pos.colIndex;
    });

    document.addEventListener('mouseup', () => {
        isSelecting = false;
        table.classList.remove('grid-dragging');
        // Deferred: if the drag ended outside this table, no click event
        // will ever reach the capture handler below to clear this flag.
        setTimeout(() => {
            dragMoved = false;
        }, 0);
    });

    // Capture phase, so this runs before Alpine's own bubbling @click handler
    // that would otherwise open the cell the drag/shift-click ended on for
    // editing. Only grid cells are suppressed, so the row's delete/log
    // controls never get silently swallowed by a drag that ended over them.
    table.addEventListener('click', (event) => {
        if (dragMoved && event.target.closest('td[data-field]')) {
            event.stopPropagation();
            event.preventDefault();
        }
        dragMoved = false;
    }, true);

    document.addEventListener('mousedown', (event) => {
        if (!event.target.closest?.('table[data-grid] td[data-field]')) {
            keyboardActive = false;
        }
    }, true);
    document.addEventListener('focusin', (event) => {
        if (!event.target.closest?.('td[data-field]')) {
            keyboardActive = false;
        }
    });

    /**
     * Closes visible cell editors (as if Escape were pressed in them), except
     * the one with focus and any inside exceptTd.
     */
    function closeOtherEditors(exceptTd = null) {
        table.querySelectorAll('td[data-field] [name="value"]').forEach((field) => {
            if (field !== document.activeElement && !exceptTd?.contains(field) && field.getClientRects().length > 0) {
                // Bubbles to the cell's x-on:keydown.escape: restore + close.
                field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            }
        });
    }

    const ARROW_DELTAS = {
        ArrowUp: [-1, 0],
        ArrowDown: [1, 0],
        ArrowLeft: [0, -1],
        ArrowRight: [0, 1],
    };

    /** Blurs the focused cell editor in this table, if any. */
    function releaseFocusedCellEditor() {
        const active = document.activeElement;
        if (active && active.name === 'value' && active.closest('td[data-field]') && table.contains(active)) {
            active.blur();
        }
    }

    /**
     * A focused, visible <select> cell editor. Arrow keys on it are treated
     * as grid navigation: on Windows/Linux an arrow on a closed select would
     * otherwise change its value and fire change -> an unintended save.
     */
    function focusedCellSelect() {
        const active = document.activeElement;
        return active?.tagName === 'SELECT' && active.closest('td[data-field]') && table.contains(active)
            && active.getClientRects().length > 0 ? active : null;
    }

    /** True while the user is typing into a visible form control (cell editor, search box, ...). */
    function isTypingInField() {
        const active = document.activeElement;
        if (!active || !['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)) {
            return false;
        }
        // After Escape, Alpine hides the cell editor with x-show but the
        // hidden control keeps focus; that shouldn't block grid navigation.
        return active.getClientRects().length > 0;
    }

    document.addEventListener('keydown', (event) => {
        const delta = ARROW_DELTAS[event.key];
        if (!delta || !anchorCell || !keyboardActive || event.altKey || event.isComposing
            || (isTypingInField() && !focusedCellSelect())) {
            return;
        }

        const rows = getRows();
        const colCount = rows.length ? getCells(rows[0]).length : 0;
        if (rows.length === 0 || colCount === 0) {
            return;
        }

        const toEdge = event.metaKey || event.ctrlKey;
        const from = event.shiftKey ? focusCell : anchorCell;
        const clamp = (value, max) => Math.min(Math.max(value, 0), max);
        const jump = (current, d, max) => (d === 0 ? current : toEdge ? (d < 0 ? 0 : max) : current + d);
        const next = {
            rowIndex: clamp(jump(from.rowIndex, delta[0], rows.length - 1), rows.length - 1),
            colIndex: clamp(jump(from.colIndex, delta[1], colCount - 1), colCount - 1),
        };

        event.preventDefault();
        releaseFocusedCellEditor();
        closeOtherEditors();

        if (event.shiftKey) {
            currentRange = highlightRange(anchorCell, next);
        } else {
            anchorCell = next;
            currentRange = highlightRange(next, next);
        }

        cellAt(next)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });

    /**
     * Opens td's editor (if it isn't already) and focuses its field: with the
     * whole value selected (Enter, so typing replaces it as in a spreadsheet)
     * or with the caret at the end (a mouse click, so a stray keystroke can't
     * wipe a long value). Every other open editor is closed first.
     */
    function openCellEditor(td, { selectAll }) {
        const root = td.querySelector('[x-data]');
        const field = td.querySelector('[name="value"]');
        if (!root || !field || !window.Alpine) {
            return;
        }

        // Clicking the padding of the cell being edited blurs its field, which
        // fires change -> PATCH; the response will replace this cell, so
        // re-focusing the doomed field would silently drop anything typed.
        if (field.classList.contains('htmx-request')) {
            return;
        }

        closeOtherEditors(td);
        window.Alpine.$data(root).editing = true;

        // Alpine's x-show reveals the editor on a later animation frame, and a
        // display:none field can't take focus, so wait (briefly) until it's
        // visible. Give up if the cell was closed or swapped out meanwhile.
        let attempts = 0;
        const focusWhenVisible = () => {
            if (!field.isConnected) {
                return;
            }
            if (field.getClientRects().length === 0) {
                if (++attempts < 30) {
                    setTimeout(focusWhenVisible, 16);
                }
                return;
            }
            field.focus();
            // Only text controls have a caret (setSelectionRange throws on date).
            if (field.tagName === 'TEXTAREA' || field.type === 'text') {
                if (selectAll) {
                    field.select();
                } else {
                    field.setSelectionRange(field.value.length, field.value.length);
                }
            }
        };
        focusWhenVisible();
    }

    // Enter on the active cell opens it for editing, as in a spreadsheet.
    // Listening on keyup (not keydown) matters: focus only moves into the
    // field after the key is released, so the field's own
    // hx-trigger="keyup[key=='Enter']" never sees this keystroke and doesn't
    // immediately commit the value it was just opened with.
    document.addEventListener('keyup', (event) => {
        if (event.key !== 'Enter' || !anchorCell || !keyboardActive || event.isComposing
            || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || isTypingInField()) {
            return;
        }

        const td = cellAt(anchorCell);
        if (td) {
            openCellEditor(td, { selectAll: true });
        }
    });

    // Escape cancels the edit (restores the original value and closes) even
    // when the editor doesn't have focus (e.g. focus moved elsewhere, or a
    // failed save re-rendered it unfocused). A focused editor handles Escape
    // itself via x-on:keydown.escape. Not gated on keyboardActive: it only
    // ever closes unfocused grid editors, so it's safe from anywhere.
    document.addEventListener('keydown', (event) => {
        // Ignore the synthetic Escapes closeOtherEditors() dispatches, which
        // bubble up to here too.
        if (event.key !== 'Escape' || !event.isTrusted || event.isComposing) {
            return;
        }
        closeOtherEditors();
    });

    // A click anywhere in a cell — its display text or the padding around
    // it — opens that cell for editing with the field focused. A drag or
    // Shift+click never gets here: the capture handler above stops it. Only
    // one cell is in edit mode at a time; a focused editor with typed changes
    // has already blurred — and so committed them via hx-trigger="change" —
    // by the time this click runs.
    table.addEventListener('click', (event) => {
        const td = event.target.closest('td[data-field]');
        if (td && !event.target.closest('input, textarea, select')) {
            openCellEditor(td, { selectAll: false });
        }
    });

    document.addEventListener('keydown', (event) => {
        const metaOrCtrl = event.metaKey || event.ctrlKey;
        if (!metaOrCtrl || !currentRange) {
            return;
        }

        if (isTypingInField()) {
            // A cell is actively being edited: let the browser's native
            // copy/paste work on that field instead of the grid-level one.
            return;
        }

        if (event.key === 'c' || event.key === 'C') {
            // Don't hijack an ordinary text selection made elsewhere on the page.
            if (window.getSelection()?.toString()) {
                return;
            }
            copySelection(currentRange);
        } else if (event.key === 'v' || event.key === 'V') {
            event.preventDefault();
            pasteSelection(currentRange);
        }
    });

    function cellDisplayText(td) {
        const span = td.querySelector('span');
        // textContent (not innerText) so a cell currently open for editing —
        // whose display <span> is hidden via x-show — still copies its last
        // committed value instead of "" (innerText is "" for display:none).
        const text = span?.textContent ?? '';
        // Flatten real newlines/runs of whitespace (e.g. multi-line notes, or
        // Blade's own template whitespace) so they can't corrupt the TSV grid.
        return text.replace(/\s+/g, ' ').trim();
    }

    async function copySelection(range) {
        const lines = [];
        let row = -1;
        let line = [];

        forEachCellInRange(range, (td, r) => {
            if (r !== row) {
                if (row !== -1) {
                    lines.push(line.join('\t'));
                }
                row = r;
                line = [];
            }
            line.push(cellDisplayText(td));
        });
        if (line.length) {
            lines.push(line.join('\t'));
        }

        try {
            await navigator.clipboard.writeText(lines.join('\n'));
        } catch {
            // Clipboard access can be denied (permissions, insecure context);
            // there's nothing useful to do but leave the selection as-is.
        }
    }

    function resolveAssigneeId(td, name) {
        if (name.trim() === '') {
            return '';
        }

        // The <select> for this cell is always rendered (just hidden while
        // not editing), so its options are the live list of assignee names.
        // Names are enforced unique (Assignee::validationRuleFor), so an
        // exact text match always identifies the one intended assignee.
        const select = td.querySelector('select[name="value"]');
        if (!select) {
            return name;
        }

        // Collapse whitespace the same way cellDisplayText() does when copying,
        // so an assignee name containing runs of whitespace still round-trips
        // (copy -> paste back unchanged) instead of failing to match here.
        const normalize = (value) => value.replace(/\s+/g, ' ').trim();
        const match = [...select.options].find((option) => normalize(option.textContent) === normalize(name));

        // Fall back to the raw pasted text if there's no matching assignee
        // (e.g. renamed/deleted since the page loaded); the server's
        // exists:assignees,id rule will reject it with a normal validation
        // error shown on that cell, same as any other bad paste.
        return match ? match.value : name;
    }

    async function pasteSelection(range) {
        if (pasteInFlight) {
            return;
        }

        let text;
        try {
            text = await navigator.clipboard.readText();
        } catch {
            return;
        }

        pasteInFlight = true;
        try {
            await applyPaste(range, text);
        } finally {
            pasteInFlight = false;
        }
    }

    async function applyPaste(range, text) {
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
        let transportFailures = 0;

        for (let r = 0; r < pasteRows.length; r++) {
            const rowIndex = range.rowStart + r;
            if (rowIndex >= rows.length) {
                break;
            }

            // The row could have been deleted (and htmx:beforeSwap already
            // cleared the selection) by the time this iteration's turn comes
            // up, since each cell's PATCH below is awaited one at a time.
            // Stop rather than keep PATCHing a detached row's stale id.
            if (!rows[rowIndex].isConnected) {
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

                let response;
                try {
                    response = await fetch(`/tasks/${rowId}/cells/${field}`, {
                        method: 'PATCH',
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded',
                            'X-CSRF-TOKEN': token ?? '',
                            'X-Requested-With': 'XMLHttpRequest',
                        },
                        body: `value=${encodeURIComponent(value)}`,
                    });
                } catch {
                    transportFailures++;
                    continue;
                }

                if (response.ok) {
                    td.innerHTML = await response.text();
                } else {
                    transportFailures++;
                }
            }
        }

        if (transportFailures > 0) {
            window.alert(`貼り付けに失敗したセルが${transportFailures}件あります(通信エラー)。ページを再読み込みして再度お試しください。`);
        }
    }
}
