import { formatTsv, parseTsv } from './tsv';

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
 * - Enter/Shift+Enter in a one-line text editor, and Tab/Shift+Tab in any
 *   editor (or on the grid), commit and move down/up/right/left. F2 opens
 *   the active cell with the caret at the end; typing on a text cell starts
 *   editing it, replacing the old value (not with an IME: use Enter/F2).
 *   Ctrl/Cmd+A selects every cell.
 * - Ctrl/Cmd+C / X / V copy, cut and paste the range as TSV, compatible
 *   with Google Sheets and Excel (see tsv.js); a single value or a block
 *   the selection is a multiple of fills the whole selection, and a paste
 *   is cut off at the table's edge (it never creates rows). Pasting a cut
 *   range moves it. Delete/Backspace clears the range (title and status,
 *   which can't be empty, are left as they are). All of these go
 *   through PATCH /tasks/cells, so the same validation and audit logging as
 *   a single-cell edit applies; rejected cells are reported in a toast.
 * - Ctrl/Cmd+Z undoes, Ctrl/Cmd+Shift+Z and Ctrl+Y redo, the last edit,
 *   paste, clear or cut — writing the previous values back to the server.
 *   Inside a focused text field these keys keep their native behavior.
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
    // Set by Enter in a cell editor (which commits and moves down) so the
    // Enter keyup handler doesn't immediately open the cell moved to.
    let suppressEnterKeyup = false;

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
            // A field whose save is in flight (blurring it fired change ->
            // PATCH) is left alone: on success the response replaces the
            // cell anyway, and on failure reverting it would silently throw
            // away what the user typed — keep it open so they can retry.
            if (field.classList.contains('htmx-request')) {
                return;
            }
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
     * wipe a long value). With replace, a text field starts out empty, for
     * typing over the old value. Every other open editor is closed first.
     */
    function openCellEditor(td, { selectAll, replace = false }) {
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

        // Reveal the editor right now instead of waiting for x-show, which
        // applies on a later animation frame / timer (heavily throttled when
        // the page is in the background). Until then the field can't take
        // focus, and whatever the user types in that gap is silently lost.
        // Alpine's own x-show update lands on the same state afterwards.
        const editor = field.closest('[x-show]');
        const display = root.querySelector(':scope > span[x-show]');
        if (editor && root.contains(editor)) {
            editor.style.removeProperty('display');
        }
        if (display) {
            display.style.display = 'none';
        }

        // Normally visible already (see above); as a fallback, a display:none
        // field can't take focus, so wait briefly until it is. Give up if the
        // cell was closed or swapped out meanwhile.
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
            if (replace && (field.tagName === 'TEXTAREA' || field.type === 'text')) {
                field.value = '';
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
    window.addEventListener('blur', () => {
        suppressEnterKeyup = false;
    });
    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') {
            suppressEnterKeyup = false;
        }
    }, true);
    document.addEventListener('keyup', (event) => {
        if (event.key === 'Enter' && suppressEnterKeyup) {
            suppressEnterKeyup = false;
            return;
        }
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


    // ------------------------------------------------------------------
    // Spreadsheet-style keys around a cell editor: Enter / Shift+Enter in a
    // one-line text editor and Tab / Shift+Tab in any editor commit the edit
    // and move the active cell down / up / right / left.
    // ------------------------------------------------------------------

    // Cells left by Enter/Tab whose save is in flight: if the server rejects
    // the value, the active cell goes back there with the editor focused, so
    // the error isn't silently dismissed by the next key press.
    const returnOnError = new WeakSet();

    function focusedCellEditor() {
        const active = document.activeElement;
        return active?.name === 'value' && active.closest('td[data-field]') && table.contains(active)
            && active.getClientRects().length > 0 ? active : null;
    }

    /** Moves the active cell by (dRow, dCol), collapsing the selection to it. */
    function moveActiveCell(dRow, dCol) {
        const rows = getRows();
        const colCount = rows.length ? getCells(rows[0]).length : 0;
        if (!anchorCell || rows.length === 0 || colCount === 0) {
            return;
        }
        const clamp = (value, max) => Math.min(Math.max(value, 0), max);
        const next = {
            rowIndex: clamp(anchorCell.rowIndex + dRow, rows.length - 1),
            colIndex: clamp(anchorCell.colIndex + dCol, colCount - 1),
        };
        anchorCell = next;
        currentRange = highlightRange(next, next);
        cellAt(next)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    document.addEventListener('keydown', (event) => {
        const field = focusedCellEditor();
        if (!field || event.isComposing || event.keyCode === 229 || event.altKey || event.ctrlKey || event.metaKey) {
            return;
        }

        const isTextInput = field.tagName === 'INPUT' && field.type === 'text';
        let delta = null;
        if (event.key === 'Enter' && isTextInput) {
            delta = event.shiftKey ? [-1, 0] : [1, 0];
            suppressEnterKeyup = true;
        } else if (event.key === 'Tab') {
            delta = event.shiftKey ? [0, -1] : [0, 1];
        }
        if (!delta) {
            return;
        }

        event.preventDefault();
        const td = field.closest('td[data-field]');
        const pos = cellPosition(td);
        if (pos) {
            anchorCell = pos;
        }
        keyboardActive = true;
        // Blurring commits a changed value (change -> PATCH, which marks the
        // field htmx-request so closeOtherEditors leaves it to the response);
        // an unchanged editor is simply closed.
        field.blur();
        if (field.classList.contains('htmx-request')) {
            returnOnError.add(td);
        }
        closeOtherEditors();
        moveActiveCell(delta[0], delta[1]);
    });

    // ------------------------------------------------------------------
    // Undo / redo history. One entry per user operation (a single-cell edit,
    // a paste, a clear, a cut's paste), each a list of {id, field, before,
    // after} with the raw values the server stored, so undo/redo just write
    // them back through the batch endpoint.
    // ------------------------------------------------------------------

    const HISTORY_LIMIT = 100;
    const undoStack = [];
    const redoStack = [];

    function pushHistory(changes) {
        const effective = changes.filter((change) => change.before !== change.after);
        if (effective.length === 0) {
            return;
        }
        undoStack.push(effective);
        if (undoStack.length > HISTORY_LIMIT) {
            undoStack.shift();
        }
        redoStack.length = 0;
    }

    const cellKey = (id, field) => `${id}\u0000${field}`;

    function tdFor(id, field) {
        return table.querySelector(`tr[data-row-id="${CSS.escape(String(id))}"] > td[data-field="${CSS.escape(field)}"]`);
    }

    function storedRaw(td) {
        return td?.querySelector('[data-raw]')?.dataset.raw;
    }

    // Record ordinary single-cell edits (the htmx PATCH from a cell editor).
    // Single-cell saves still in flight. Batch operations and undo/redo
    // wait for them, so e.g. Ctrl+Z right after Enter undoes that edit
    // (whose history entry only exists once its response arrives) rather
    // than the one before it, and a paste can't race a pending save.
    let cellSavesInFlight = 0;
    let cellSavesIdle = null; // { promise, resolve } while saves are in flight
    const waitForCellSaves = () => cellSavesIdle?.promise ?? Promise.resolve();

    document.body.addEventListener('htmx:beforeRequest', (event) => {
        const td = event.detail.elt?.closest?.('td[data-field]');
        if (td && table.contains(td) && event.detail.elt.name === 'value') {
            td.dataset.rawBeforeEdit = storedRaw(td) ?? '';
            if (cellSavesInFlight++ === 0) {
                let resolve;
                const promise = new Promise((r) => { resolve = r; });
                cellSavesIdle = { promise, resolve };
            }
            // Counted down on the XHR itself: htmx's afterRequest fires on
            // the field, which the swap has already detached by then, so it
            // never bubbles up to here. loadend comes after htmx's onload
            // (which swaps); the delay covers the settle step that follows,
            // so the history entry is pushed before waiting operations resume.
            event.detail.xhr?.addEventListener('loadend', () => {
                setTimeout(() => {
                    if (--cellSavesInFlight === 0) {
                        cellSavesIdle?.resolve();
                        cellSavesIdle = null;
                    }
                }, 50);
            });
        }
    });
    document.body.addEventListener('htmx:afterSwap', (event) => {
        const td = event.detail.target;
        if (!td?.matches?.('td[data-field]') || !table.contains(td)) {
            return;
        }

        const before = td.dataset.rawBeforeEdit;
        delete td.dataset.rawBeforeEdit;
        const after = storedRaw(td);
        const id = td.closest('tr')?.dataset.rowId;
        if (before !== undefined && after !== undefined && id) {
            pushHistory([{ id, field: td.dataset.field, before, after }]);
        }

    });
    // Settle (not swap): only then has Alpine initialized the swapped-in
    // cell, which openCellEditor needs.
    document.body.addEventListener('htmx:afterSettle', (event) => {
        const td = event.detail.target;
        if (!td?.matches?.('td[data-field]') || !table.contains(td)) {
            return;
        }
        const rejected = td.querySelector('[data-error]');
        if (returnOnError.has(td)) {
            returnOnError.delete(td);
            const pos = cellPosition(td);
            if (rejected && pos && !focusedCellEditor()) {
                anchorCell = pos;
                currentRange = highlightRange(pos, pos);
                openCellEditor(td, { selectAll: false });
            }
        }
    });

    // ------------------------------------------------------------------
    // Batch updates (paste / clear / cut / undo / redo) go through
    // PATCH /tasks/cells one at a time, in order, so e.g. pressing Ctrl+Z
    // twice quickly undoes two operations instead of racing.
    // ------------------------------------------------------------------

    let queue = Promise.resolve();
    const enqueue = (task) => {
        const run = async () => {
            await waitForCellSaves();
            return task();
        };
        queue = queue.then(run, run);
        return queue;
    };

    /**
     * Sends changes ([{id, field, value, text?}], last one wins per cell),
     * swaps the re-rendered cells in and reports rejected ones. Returns the
     * applied changes as history items ({id, field, before, after}).
     */
    async function sendChanges(changes) {
        const byCell = new Map();
        changes.forEach((change) => byCell.set(cellKey(change.id, change.field), change));
        const unique = [...byCell.values()];
        if (unique.length === 0) {
            return [];
        }

        let data;
        try {
            const response = await fetch('/tasks/cells', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.content ?? '',
                    'X-Requested-With': 'XMLHttpRequest',
                },
                body: JSON.stringify({ changes: unique }),
            });
            if (response.status === 422) {
                showToast('一度に変更できるセル数(5000)を超えているか、内容が不正なため保存できませんでした。');
                return [];
            }
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            data = await response.json();
        } catch {
            showToast('保存に失敗しました(通信エラー)。ページを再読み込みして再度お試しください。');
            return [];
        }

        const applied = [];
        const errors = new Map();
        for (const result of data.results ?? []) {
            if (!result.ok) {
                errors.set(result.error, (errors.get(result.error) ?? 0) + 1);
                continue;
            }
            applied.push({ id: String(result.id), field: result.field, before: result.before, after: result.after });
            const td = tdFor(result.id, result.field);
            if (td) {
                td.innerHTML = result.html;
                window.htmx?.process(td);
            }
        }

        if (errors.size > 0) {
            const total = [...errors.values()].reduce((a, b) => a + b, 0);
            const reasons = [...errors.entries()].map(([message, count]) => `${message}(${count}件)`).join(' / ');
            showToast(`${total}件のセルは変更できませんでした: ${reasons}`);
        }

        return applied;
    }

    /** Selects the bounding box of the given cells that are on screen. */
    function selectCells(items) {
        const positions = items
            .map((item) => tdFor(item.id, item.field))
            .filter(Boolean)
            .map(cellPosition)
            .filter(Boolean);
        if (positions.length === 0) {
            return;
        }
        const topLeft = {
            rowIndex: Math.min(...positions.map((p) => p.rowIndex)),
            colIndex: Math.min(...positions.map((p) => p.colIndex)),
        };
        const bottomRight = {
            rowIndex: Math.max(...positions.map((p) => p.rowIndex)),
            colIndex: Math.max(...positions.map((p) => p.colIndex)),
        };
        anchorCell = topLeft;
        currentRange = highlightRange(topLeft, bottomRight);
        cellAt(topLeft)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    function undoOrRedo(fromStack, toStack, side) {
        enqueue(async () => {
            const entry = fromStack.pop();
            if (!entry) {
                return;
            }
            const applied = await sendChanges(entry.map((item) => ({ id: item.id, field: item.field, value: side === 'before' ? item.before : item.after })));
            if (applied.length > 0) {
                // Keep only what was actually written back (a deleted row can't be).
                const done = new Set(applied.map((item) => cellKey(item.id, item.field)));
                toStack.push(entry.filter((item) => done.has(cellKey(item.id, item.field))));
                selectCells(entry);
            } else {
                // Nothing could be restored (e.g. offline): keep the entry.
                fromStack.push(entry);
            }
        });
    }

    // ------------------------------------------------------------------
    // Clipboard: copy / cut / paste as TSV, compatible with Google Sheets
    // and Excel. The native copy/cut/paste events are used so no clipboard
    // permission is needed; if a browser doesn't fire them while no text
    // field is focused, the keydown handler falls back to the Clipboard API.
    // ------------------------------------------------------------------

    // The range most recently cut: its cells are cleared when that same
    // text is pasted back into the grid (as in a spreadsheet, cut + paste
    // moves the values). Escape or a new copy cancels it.
    let cutSource = null; // { cells: [{id, field}], text }

    function setCutSource(value) {
        table.querySelectorAll('.grid-cell-cut').forEach((el) => el.classList.remove('grid-cell-cut'));
        cutSource = value;
        cutSource?.cells.forEach((item) => tdFor(item.id, item.field)?.classList.add('grid-cell-cut'));
    }

    /** True when Ctrl/Cmd+C/X/V/Z, Delete, ... should act on the grid selection. */
    function gridHasKeyboard() {
        return keyboardActive && currentRange && anchorCell && !isTypingInField();
    }

    function selectionTsv(range) {
        const rows = [];
        forEachCellInRange(range, (td, r) => {
            const index = r - range.rowStart;
            (rows[index] ??= []).push(td.querySelector('[data-text]')?.dataset.text ?? '');
        });
        return formatTsv(rows.filter(Boolean));
    }

    function rangeItems(range) {
        const items = [];
        forEachCellInRange(range, (td) => {
            items.push({ id: td.closest('tr').dataset.rowId, field: td.dataset.field });
        });
        return items;
    }

    // Fields a spreadsheet-style clear leaves alone: they can't be empty
    // (title, status), so clearing them would only ever be rejected.
    const UNCLEARABLE_FIELDS = new Set(['title', 'status']);

    function clearRange(range) {
        const items = rangeItems(range).filter((item) => !UNCLEARABLE_FIELDS.has(item.field));
        enqueue(async () => {
            pushHistory(await sendChanges(items.map((item) => ({ ...item, value: '' }))));
        });
    }

    function pasteText(text) {
        const range = currentRange;
        const rows = getRows();
        if (!range || rows.length === 0) {
            return;
        }
        if (text === '') {
            return;
        }
        const block = parseTsv(text);
        const blockHeight = block.length;
        const blockWidth = Math.max(...block.map((row) => row.length));
        const selHeight = range.rowEnd - range.rowStart + 1;
        const selWidth = range.colEnd - range.colStart + 1;
        const colCount = getCells(rows[0]).length;

        // As in Sheets/Excel: a selection that's an exact multiple of the
        // copied block (including a single value into any range) is filled by
        // repeating it; otherwise the block is pasted once from the top-left
        // cell. Either way it's cut off at the table's last row/column.
        const tile = selHeight % blockHeight === 0 && selWidth % blockWidth === 0;
        const height = Math.min(tile ? selHeight : blockHeight, rows.length - range.rowStart);
        const width = Math.min(tile ? selWidth : blockWidth, colCount - range.colStart);

        const changes = [];
        for (let r = 0; r < height; r++) {
            const cells = getCells(rows[range.rowStart + r]);
            for (let c = 0; c < width; c++) {
                const td = cells[range.colStart + c];
                if (td) {
                    changes.push({
                        id: rows[range.rowStart + r].dataset.rowId,
                        field: td.dataset.field,
                        value: block[r % blockHeight][c % blockWidth] ?? '',
                        text: true,
                    });
                }
            }
        }
        if (changes.length === 0) {
            return;
        }

        // Pasting what was cut moves it: clear the source cells that the
        // paste doesn't overwrite, in the same request and undo step.
        let clears = [];
        const normalize = (value) => value.replace(/\r\n?/g, '\n').replace(/\n$/, '');
        if (cutSource && normalize(cutSource.text) === normalize(text)) {
            const targets = new Set(changes.map((change) => cellKey(change.id, change.field)));
            clears = cutSource.cells
                .filter((item) => !targets.has(cellKey(item.id, item.field)) && !UNCLEARABLE_FIELDS.has(item.field))
                .map((item) => ({ ...item, value: '' }));
            setCutSource(null);
        }

        const topLeft = { rowIndex: range.rowStart, colIndex: range.colStart };
        anchorCell = topLeft;
        currentRange = highlightRange(topLeft, { rowIndex: range.rowStart + height - 1, colIndex: range.colStart + width - 1 });

        enqueue(async () => {
            pushHistory(await sendChanges([...clears, ...changes]));
        });
    }

    // Set on a grid Ctrl/Cmd+C/X/V keydown; cleared by the matching native
    // event. Still set shortly after means the browser didn't fire one.
    let pendingClipboardKey = null;

    function handleCopyOrCut(clipboardData, isCut) {
        const range = currentRange;
        const text = selectionTsv(range);
        const cells = isCut ? rangeItems(range) : null;
        if (clipboardData) {
            clipboardData.setData('text/plain', text);
            setCutSource(isCut ? { cells, text } : null);
            return;
        }
        if (!navigator.clipboard) {
            showToast('このブラウザではクリップボードにコピーできませんでした。');
            return;
        }
        navigator.clipboard.writeText(text).then(
            () => setCutSource(isCut ? { cells, text } : null),
            () => showToast('クリップボードへのコピーが許可されていません。ブラウザの設定を確認してください。'),
        );
    }

    function onClipboardEvent(event) {
        if (!gridHasKeyboard()) {
            return;
        }
        if (event.type === 'copy' && window.getSelection()?.toString()) {
            // An ordinary text selection on the page: copy that instead.
            return;
        }
        pendingClipboardKey = null;
        event.preventDefault();
        if (event.type === 'paste') {
            pasteText(event.clipboardData?.getData('text/plain') ?? '');
        } else {
            handleCopyOrCut(event.clipboardData, event.type === 'cut');
        }
    }
    document.addEventListener('copy', onClipboardEvent);
    document.addEventListener('cut', onClipboardEvent);
    document.addEventListener('paste', onClipboardEvent);

    // ------------------------------------------------------------------
    // Grid-level keys (only while the grid has the keyboard, i.e. no visible
    // text field is focused): clipboard, undo/redo, Delete, select all, F2,
    // Tab, and typing to start an edit.
    // ------------------------------------------------------------------

    document.addEventListener('keydown', (event) => {
        // defaultPrevented: already handled above (e.g. Tab in an editor has
        // committed and moved; it must not move a second time here).
        if (event.defaultPrevented || event.isComposing || !gridHasKeyboard()) {
            return;
        }
        const metaOrCtrl = event.metaKey || event.ctrlKey;
        const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;

        if (metaOrCtrl && !event.altKey) {
            if (['c', 'x', 'v'].includes(key) && !event.shiftKey) {
                if (key === 'c' && window.getSelection()?.toString()) {
                    return;
                }
                pendingClipboardKey = key;
                setTimeout(() => {
                    if (pendingClipboardKey !== key) {
                        return;
                    }
                    pendingClipboardKey = null;
                    if (key === 'v') {
                        navigator.clipboard?.readText().then(pasteText, () => {});
                    } else {
                        handleCopyOrCut(null, key === 'x');
                    }
                }, 50);
                return;
            }
            if (key === 'z') {
                event.preventDefault();
                if (event.shiftKey) {
                    undoOrRedo(redoStack, undoStack, 'after');
                } else {
                    undoOrRedo(undoStack, redoStack, 'before');
                }
                return;
            }
            if (key === 'y' && event.ctrlKey && !event.metaKey && !event.shiftKey) {
                event.preventDefault();
                undoOrRedo(redoStack, undoStack, 'after');
                return;
            }
            if (key === 'a' && !event.shiftKey) {
                event.preventDefault();
                const rows = getRows();
                const colCount = rows.length ? getCells(rows[0]).length : 0;
                if (colCount > 0) {
                    anchorCell = { rowIndex: 0, colIndex: 0 };
                    currentRange = highlightRange(anchorCell, { rowIndex: rows.length - 1, colIndex: colCount - 1 });
                }
                return;
            }
            return;
        }

        if (event.altKey || metaOrCtrl) {
            return;
        }

        if (event.key === 'Delete' || event.key === 'Backspace') {
            event.preventDefault();
            clearRange(currentRange);
        } else if (event.key === 'Escape') {
            setCutSource(null);
        } else if (event.key === 'Tab') {
            const colCount = getCells(getRows()[0]).length;
            const atEdge = event.shiftKey ? anchorCell.colIndex === 0 : anchorCell.colIndex === colCount - 1;
            if (atEdge) {
                // Let Tab move focus out of the grid as usual.
                keyboardActive = false;
                return;
            }
            event.preventDefault();
            moveActiveCell(0, event.shiftKey ? -1 : 1);
        } else if (event.key === 'F2') {
            event.preventDefault();
            const td = cellAt(anchorCell);
            if (td) {
                openCellEditor(td, { selectAll: false });
            }
        } else if ([...event.key].length === 1 && event.keyCode !== 229) {
            // Typing on a text cell starts editing it with what's typed
            // replacing the old value, as in a spreadsheet. Focus moves into
            // the field during this keydown, so the browser inserts the
            // character there. Not for an IME keystroke (key "Process" /
            // keyCode 229): its composition has already begun outside the
            // field and the first character would be lost or garbled, so
            // with an IME press Enter or F2 first.
            const td = cellAt(anchorCell);
            const field = td?.querySelector('[name="value"]');
            if (field && (field.tagName === 'TEXTAREA' || field.type === 'text')) {
                currentRange = highlightRange(anchorCell, anchorCell);
                openCellEditor(td, { selectAll: false, replace: true });
            }
        }
    });

    // ------------------------------------------------------------------
    // Toast for batch results (rejected cells, network errors).
    // ------------------------------------------------------------------

    let toastTimer = null;
    function showToast(message) {
        let toast = document.getElementById('grid-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'grid-toast';
            toast.setAttribute('role', 'status');
            toast.className = 'fixed bottom-4 left-1/2 z-50 max-w-[90vw] -translate-x-1/2 rounded bg-gray-900 px-4 py-2 text-sm text-white shadow-lg';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            toast.hidden = true;
        }, 6000);
    }
}
