import * as React from 'react';
import { StatusBox } from '@odf/shared/generic/status-box';
import { K8sResourceCommon } from '@openshift-console/dynamic-plugin-sdk';
import {
  SortByDirection,
  TableComposable,
  Tbody,
  Th,
  ThProps,
  Thead,
  Tr,
} from '@patternfly/react-table';
import { useSortList } from '../hooks/sort-list';

export type TableColumnProps = ThProps & {
  thProps?: TableThProps;
  columnName: string | React.ReactNode;
  sortFunction?: <T>(a: T, b: T, c: SortByDirection) => number;
};

export type RowComponentType<T extends K8sResourceCommon> = {
  row: T;
  rowIndex?: number;
  extraProps?: any;
};

export const ComposableTable: ComposableTableProps = <
  T extends K8sResourceCommon
>({
  columns,
  rows,
  RowComponent,
  extraProps,
  loaded,
  loadError,
  unfilteredData,
  noDataMsg,
  emptyRowMessage,
}) => {
  const {
    onSort,
    sortIndex: activeSortIndex,
    sortDirection: activeSortDirection,
    sortedData: sortedRows,
  } = useSortList<T>(rows, columns, false);

  const getSortParams = (columnIndex: number): ThProps['sort'] => ({
    sortBy: {
      index: activeSortIndex,
      direction: activeSortDirection,
    },
    onSort: onSort,
    columnIndex,
  });

  return (
    <StatusBox
      loadError={loadError}
      loaded={loaded}
      data={sortedRows}
      EmptyMsg={emptyRowMessage}
      unfilteredData={unfilteredData}
      NoDataEmptyMsg={noDataMsg}
      skeleton={<div className="loading-skeleton--table pf-u-mt-lg" />}
    >
      <TableComposable
        translate={null}
        aria-label="Composable table"
        variant="compact"
      >
        <Thead translate={null}>
          <Tr translate={null}>
            {columns?.map((col, index) => (
              <Th
                {...(!!col?.thProps ? col.thProps : {})}
                {...(!!col?.sortFunction ? { sort: getSortParams(index) } : {})}
                translate={null}
                key={col?.columnName}
              >
                {col?.columnName}
              </Th>
            ))}
          </Tr>
        </Thead>
        <Tbody translate={null}>
          {sortedRows.map((row, rowIndex) => (
            <RowComponent
              row={row}
              rowIndex={rowIndex}
              extraProps={extraProps}
            />
          ))}
        </Tbody>
      </TableComposable>
    </StatusBox>
  );
};

// Omit ref to resolve incompatible issue
// sort is replaced by sortFunction
type TableThProps = Omit<ThProps, 'sort' | 'ref'>;

type TableProps<T extends K8sResourceCommon> = {
  rows: T[];
  columns: TableColumnProps[];
  RowComponent: React.ComponentType<RowComponentType<T>>;
  extraProps?: any;
  loaded: boolean;
  loadError?: any;
  unfilteredData?: [];
  noDataMsg?: React.FC;
  emptyRowMessage?: React.FC;
};

type ComposableTableProps = <T extends K8sResourceCommon>(
  props: React.PropsWithoutRef<TableProps<T>>
) => ReturnType<React.FC>;