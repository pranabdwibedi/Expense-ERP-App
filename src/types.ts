export type UserRole = 'employee' | 'manager' | 'ceo' | 'finance' | 'admin';

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  managerId?: string;
  password?: string;
  photoUrl?: string;
  bio?: string;
  department?: string;
  phone?: string;
  joinedDate?: string;
}

export type ExpenseStatus = 'pending_manager' | 'pending_ceo' | 'pending_finance' | 'settled' | 'rejected' | 'needs_revision';

export interface AuditEntry {
  action: string;
  actorId: string;
  actorName: string;
  timestamp: string;
  comment?: string;
}

export interface ExpenseItem {
  id: string;
  category: string;
  amount: number;
  merchant: string;
  date: string;
  description: string;
  attachmentUrl?: string;
  attachmentName?: string;
}

export interface ExpenseClaim {
  id: string;
  employeeId: string;
  employeeName: string;
  amount: number;
  description: string;
  status: ExpenseStatus;
  submittedAt: string;
  history: AuditEntry[];
  items: ExpenseItem[];
  attachmentUrl?: string;
  attachmentName?: string;
  settlementProofUrl?: string;
  settlementProofName?: string;
}

export interface Notification {
  id: string;
  userId: string;
  message: string;
  type: string;
  read: boolean;
  createdAt: string;
}
