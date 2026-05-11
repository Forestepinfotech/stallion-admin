import type {
  AdminOrderDetailDto,
  AdminOrderListItemDto,
  AdminOrderReturnDto,
  AdminOrderShipmentDto,
} from '../../../core/api/generated/schemas';
import type { StatusBadgeVariant } from '../../components/status-badge/status-badge.component';

export type OrderListRow = Pick<
  AdminOrderListItemDto,
  | 'payment_status'
  | 'approval_status'
  | 'fulfillment_status'
  | 'return_state'
  | 'refund_state'
  | 'overall_status'
  | 'status_label'
  | 'status_message'
  | 'is_paid'
  | 'requires_admin_approval'
  | 'is_approved'
>;

export type OrderActionAvailability = {
  canApprove: boolean;
  canShip: boolean;
  canManageReturns: boolean;
  canRefund: boolean;
  primaryActionLabel: string | null;
};

export function statusBadge(label: string, variant: StatusBadgeVariant): { label: string; variant: StatusBadgeVariant } {
  return { label, variant };
}

export function paymentBadge(status: string): { label: string; variant: StatusBadgeVariant } {
  switch (status) {
    case 'paid':
      return statusBadge('Paid', 'success');
    case 'pending':
      return statusBadge('Payment pending', 'warning');
    case 'disputed':
      return statusBadge('Disputed', 'danger');
    case 'refunded':
      return statusBadge('Refunded', 'neutral');
    case 'partially_refunded':
      return statusBadge('Partially refunded', 'info');
    default:
      return statusBadge(String(status || 'Unknown'), 'neutral');
  }
}

export function approvalBadge(status: string): { label: string; variant: StatusBadgeVariant } {
  switch (status) {
    case 'not_required':
      return statusBadge('Approval not required', 'neutral');
    case 'approved':
      return statusBadge('Approved', 'success');
    case 'pending':
      return statusBadge('Awaiting approval', 'warning');
    default:
      return statusBadge(String(status || 'Unknown'), 'neutral');
  }
}

export function fulfillmentBadge(status: string): { label: string; variant: StatusBadgeVariant } {
  switch (status) {
    case 'pending':
      return statusBadge('Not fulfilled', 'warning');
    case 'processing':
      return statusBadge('Packing', 'info');
    case 'shipped':
      return statusBadge('Shipped', 'success');
    case 'delivered':
      return statusBadge('Delivered', 'success');
    case 'cancelled':
      return statusBadge('Cancelled', 'danger');
    default:
      return statusBadge(String(status || 'Unknown'), 'neutral');
  }
}

export function returnBadge(state: string): { label: string; variant: StatusBadgeVariant } {
  switch (state) {
    case 'none':
      return statusBadge('No return', 'neutral');
    case 'requested':
      return statusBadge('Return requested', 'warning');
    case 'in_review':
      return statusBadge('Return in review', 'info');
    case 'approved':
      return statusBadge('Return approved', 'success');
    case 'rejected':
      return statusBadge('Return rejected', 'danger');
    case 'refunded':
      return statusBadge('Return refunded', 'neutral');
    default:
      return statusBadge(String(state || 'Unknown'), 'neutral');
  }
}

export function refundBadge(state: string): { label: string; variant: StatusBadgeVariant } {
  switch (state) {
    case 'none':
      return statusBadge('No refund', 'neutral');
    case 'requested':
      return statusBadge('Refund requested', 'warning');
    case 'in_review':
      return statusBadge('Refund in review', 'info');
    case 'approved':
      return statusBadge('Refund approved', 'info');
    case 'processing':
      return statusBadge('Refund processing', 'warning');
    case 'refunded':
      return statusBadge('Refunded', 'neutral');
    case 'rejected':
      return statusBadge('Refund rejected', 'danger');
    case 'failed':
      return statusBadge('Refund failed', 'danger');
    default:
      return statusBadge(String(state || 'Unknown'), 'neutral');
  }
}

export function orderActionsForListRow(row: OrderListRow): OrderActionAvailability {
  const approvalPending = row.approval_status === 'pending';
  const approved = row.approval_status === 'approved' || row.approval_status === 'not_required';
  const paid = row.payment_status === 'paid';
  const canApprove = paid && approvalPending;

  const notYetShipped = row.fulfillment_status === 'pending' || row.fulfillment_status === 'processing';
  const canShip = paid && approved && notYetShipped && row.overall_status !== 'cancelled';

  const canManageReturns = row.return_state === 'requested' || row.return_state === 'in_review' || row.return_state === 'approved';
  const canRefund =
    row.refund_state === 'requested' || row.refund_state === 'in_review' || row.refund_state === 'approved';

  const primaryActionLabel = canApprove
    ? 'Approve'
    : canShip
      ? 'Ship'
      : canManageReturns
        ? 'Review return'
        : canRefund
          ? 'Review refund'
          : null;

  return { canApprove, canShip, canManageReturns, canRefund, primaryActionLabel };
}

export function latestShipment(shipments: AdminOrderShipmentDto[] | null | undefined): AdminOrderShipmentDto | null {
  if (!Array.isArray(shipments) || shipments.length === 0) return null;
  const sorted = [...shipments].sort((a, b) => {
    const ad = a.shipped_at ? new Date(a.shipped_at as any).getTime() : 0;
    const bd = b.shipped_at ? new Date(b.shipped_at as any).getTime() : 0;
    return bd - ad;
  });
  return sorted[0] ?? null;
}

export function canGenerateShipmentLabel(order: AdminOrderDetailDto): boolean {
  const approved = order.approval_status === 'approved' || order.approval_status === 'not_required';
  const paid = order.payment_status === 'paid';
  const notYetShipped = order.fulfillment_status === 'pending' || order.fulfillment_status === 'processing';
  return paid && approved && notYetShipped && order.overall_status !== 'cancelled';
}

export function latestReturn(returns: AdminOrderReturnDto[] | null | undefined): AdminOrderReturnDto | null {
  if (!Array.isArray(returns) || returns.length === 0) return null;
  const sorted = [...returns].sort((a, b) => {
    const ad = a.requested_at ? new Date(a.requested_at as any).getTime() : 0;
    const bd = b.requested_at ? new Date(b.requested_at as any).getTime() : 0;
    return bd - ad;
  });
  return sorted[0] ?? null;
}

