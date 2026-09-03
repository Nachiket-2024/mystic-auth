import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChakraProvider, defaultSystem } from '@chakra-ui/react';

import DataTable, { type DataTableColumn } from '@/ui/DataTable/DataTable';

interface Row {
  id: number;
  name: string;
}

const columns: DataTableColumn<Row>[] = [
  { key: 'id', header: 'ID', render: (row) => row.id },
  { key: 'name', header: 'Name', render: (row) => row.name },
  // A real interactive control inside a cell (like UsersTable's Role
  // select); row-click-to-select must not fire underneath it.
  { key: 'action', header: 'Action', render: () => <button>Row action</button> },
];

function renderTable(props: Partial<React.ComponentProps<typeof DataTable<Row>>> = {}) {
  return render(
    <ChakraProvider value={defaultSystem}>
      <DataTable columns={columns} rows={[]} rowKey={(row) => row.id} {...props} />
    </ChakraProvider>
  );
}

describe('DataTable', () => {
  it('renders skeleton placeholders while loading, not the rows or empty state', () => {
    renderTable({ isLoading: true, rows: [{ id: 1, name: 'Alice' }] });

    expect(screen.queryByText('Alice')).toBeNull();
    expect(screen.getByText('ID')).toBeInTheDocument();
  });

  it('renders the error message when isError is true, even if rows are present', () => {
    renderTable({ isError: true, errorMessage: 'Could not load rows', rows: [{ id: 1, name: 'Alice' }] });

    expect(screen.getByText('Could not load rows')).toBeInTheDocument();
    expect(screen.queryByText('Alice')).toBeNull();
  });

  it('falls back to the default error message when none is provided', () => {
    renderTable({ isError: true });

    expect(screen.getByText('Failed to load data')).toBeInTheDocument();
  });

  it('renders the empty state when rows is an empty array', () => {
    renderTable({ rows: [] });

    expect(screen.getByText('No data available')).toBeInTheDocument();
  });

  it('renders the empty state when rows is undefined', () => {
    renderTable({ rows: undefined });

    expect(screen.getByText('No data available')).toBeInTheDocument();
  });

  it('renders a custom empty message when provided', () => {
    renderTable({ rows: [], emptyMessage: 'Nothing here yet' });

    expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
  });

  it('renders one row per item, using rowKey and each column render function', () => {
    renderTable({ rows: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }] });

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(3); // header + 2 rows
  });

  // Row-click-to-select: opt-in via `rowClickSelects` (e.g. BulkActionToolbar's
  // "Select mode" button). While active, clicking anywhere in a selectable
  // row toggles it, but a click on a real control inside the row (a button,
  // a select) should keep doing its own thing instead.
  describe('row-click-to-select', () => {
    function renderSelectable(selectedKeys: ReadonlySet<number> = new Set(), rowClickSelects = true) {
      const onSelectionChange = vi.fn();
      const utils = render(
        <ChakraProvider value={defaultSystem}>
          <DataTable
            columns={columns}
            rows={[{ id: 1, name: 'Alice' }]}
            rowKey={(row) => row.id}
            selectable
            rowClickSelects={rowClickSelects}
            selectedKeys={selectedKeys}
            onSelectionChange={onSelectionChange}
          />
        </ChakraProvider>
      );
      return { ...utils, onSelectionChange };
    }

    it('toggles selection when clicking plain row content, not just the checkbox', async () => {
      const user = userEvent.setup();
      const { onSelectionChange } = renderSelectable();

      await user.click(screen.getByText('Alice'));

      // onSelectionChange is called with the functional form, computing the
      // next set off latest state rather than a render-time snapshot (see DataTableSelection.ts).
      expect(onSelectionChange).toHaveBeenCalledTimes(1);
      const updater = onSelectionChange.mock.calls[0][0] as (prev: ReadonlySet<number>) => Set<number>;
      expect(updater(new Set())).toEqual(new Set([1]));
    });

    it('does not toggle selection when the click starts on a button inside the row', async () => {
      const user = userEvent.setup();
      const { onSelectionChange } = renderSelectable();

      await user.click(screen.getByRole('button', { name: 'Row action' }));

      expect(onSelectionChange).toHaveBeenCalledTimes(0);
    });

    it('does not toggle on row-content clicks while rowClickSelects is off (the default)', async () => {
      const user = userEvent.setup();
      const { onSelectionChange } = renderSelectable(new Set(), false);

      await user.click(screen.getByText('Alice'));

      expect(onSelectionChange).toHaveBeenCalledTimes(0);
    });

    it('does not double-toggle when clicking the checkbox itself', async () => {
      const user = userEvent.setup();
      const { onSelectionChange } = renderSelectable();

      await user.click(screen.getByRole('checkbox', { name: /select row/i }));

      expect(onSelectionChange).toHaveBeenCalledTimes(1);
      const updater = onSelectionChange.mock.calls[0][0] as (prev: ReadonlySet<number>) => Set<number>;
      expect(updater(new Set())).toEqual(new Set([1]));
    });
  });
});
