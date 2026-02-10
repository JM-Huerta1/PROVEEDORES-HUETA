
export enum UserRole {
  ADMIN = 'ADMIN',
  SUPPLIER = 'SUPPLIER'
}

export enum InvoiceStatus {
  PENDING = 'PENDING',
  SCHEDULED = 'SCHEDULED',
  PAID = 'PAID',
  REJECTED = 'REJECTED'
}

export interface Supplier {
  id: string;
  name: string;
  email: string;
  taxId: string;
  balance: number;
  totalPaid: number;
}

export interface Invoice {
  id: string;
  supplierId: string;
  invoiceNumber: string;
  amount: number;
  currency: 'ARS' | 'USD';
  uploadDate: string;
  estimatedPaymentDate?: string;
  paymentDate?: string;
  status: InvoiceStatus;
  fileUrl?: string;
  notes?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  supplierId?: string;
}

export type View = 'LOGIN' | 'SUPPLIER_DASHBOARD' | 'ADMIN_DASHBOARD' | 'INVOICE_UPLOAD' | 'SUPPLIER_LIST';
