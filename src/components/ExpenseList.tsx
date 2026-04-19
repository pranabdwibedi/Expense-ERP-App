import React, { useState } from 'react';
import { UserProfile, ExpenseClaim, ExpenseStatus, AuditEntry, ExpenseItem } from '../types';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, updateDoc, addDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { toast } from 'sonner';
import { CheckCircle2, XCircle, Eye, History, Loader2, ExternalLink, FileText, Paperclip, X, Reply, ArrowRight } from 'lucide-react';
import { formatDate } from '../lib/date-utils';
import { storage } from '../firebase';

interface ExpenseListProps {
  user: UserProfile;
  expenses: ExpenseClaim[];
  onEdit?: (expense: ExpenseClaim) => void;
  onView?: (expense: ExpenseClaim) => void;
}

export function ExpenseList({ user, expenses, onEdit, onView }: ExpenseListProps) {
  const [selectedExpense, setSelectedExpense] = useState<ExpenseClaim | null>(null);
  const [isApprovalOpen, setIsApprovalOpen] = useState(false);
  const [approvalAction, setApprovalAction] = useState<'approve' | 'reject' | 'send_back'>('approve');
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [settlementFile, setSettlementFile] = useState<File | null>(null);
  const settlementFileInputRef = React.useRef<HTMLInputElement>(null);

  const getStatusBadge = (status: ExpenseStatus) => {
    switch (status) {
      case 'pending_manager': return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Pending Manager</Badge>;
      case 'pending_ceo': return <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">Pending CEO</Badge>;
      case 'pending_finance': return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Pending Finance</Badge>;
      case 'settled': return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Settled</Badge>;
      case 'rejected': return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Rejected</Badge>;
      case 'needs_revision': return <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-300 italic">Needs Revision</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const canApprove = (expense: ExpenseClaim) => {
    if (expense.status === 'rejected' || expense.status === 'settled') return false;
    if (user.role === 'admin') return true;
    if (user.role === 'manager' && expense.status === 'pending_manager') return true;
    if (user.role === 'ceo' && expense.status === 'pending_ceo') return true;
    if (user.role === 'finance' && expense.status === 'pending_finance') return true;
    return false;
  };

  const handleAction = async () => {
    if (!selectedExpense) return;
    setLoading(true);

    try {
      let nextStatus: ExpenseStatus = selectedExpense.status;
      if (approvalAction === 'reject') {
        nextStatus = 'rejected';
      } else if (approvalAction === 'send_back') {
        nextStatus = 'needs_revision';
      } else {
        if (selectedExpense.status === 'pending_manager') nextStatus = 'pending_ceo';
        else if (selectedExpense.status === 'pending_ceo') nextStatus = 'pending_finance';
        else if (selectedExpense.status === 'pending_finance') nextStatus = 'settled';
      }

      const audit: AuditEntry = {
        action: approvalAction === 'approve' ? (selectedExpense.status === 'pending_finance' ? 'Settled' : 'Approved') : (approvalAction === 'reject' ? 'Rejected' : 'Sent Back for Revision'),
        actorId: user.uid,
        actorName: user.name,
        timestamp: new Date().toISOString(),
        comment: comment,
      };

      let settlementProofUrl = '';
      let settlementProofName = '';

      if (selectedExpense.status === 'pending_finance' && approvalAction === 'approve' && settlementFile) {
        const storageRef = ref(storage, `settlements/${selectedExpense.id}/${Date.now()}_${settlementFile.name}`);
        const uploadResult = await uploadBytes(storageRef, settlementFile);
        settlementProofUrl = await getDownloadURL(uploadResult.ref);
        settlementProofName = settlementFile.name;
      }

      const updateData: any = {
        status: nextStatus,
        history: [...selectedExpense.history, audit],
      };

      if (settlementProofUrl) {
        updateData.settlementProofUrl = settlementProofUrl;
        updateData.settlementProofName = settlementProofName;
      }

      await updateDoc(doc(db, 'expenses', selectedExpense.id), updateData);

      // Notify the employee
      await addDoc(collection(db, 'notifications'), {
        userId: selectedExpense.employeeId,
        message: `Your expense claim for $${selectedExpense.amount} was ${approvalAction === 'approve' ? 'approved' : (approvalAction === 'reject' ? 'rejected' : 'sent back for revision')} by ${user.name}.`,
        read: false,
        createdAt: serverTimestamp(),
      });

      // If approved, notify the next role
      if (approvalAction === 'approve' && nextStatus !== 'settled') {
        let nextRole = '';
        if (nextStatus === 'pending_ceo') nextRole = 'ceo';
        else if (nextStatus === 'pending_finance') nextRole = 'finance';

        if (nextRole) {
          const q = query(collection(db, 'users'), where('role', '==', nextRole));
          const querySnapshot = await getDocs(q);
          
          const notificationPromises = querySnapshot.docs.map(userDoc => {
            const targetUserId = userDoc.id; 
            
            return addDoc(collection(db, 'notifications'), {
              userId: targetUserId,
              message: `New expense claim pending your approval: $${selectedExpense.amount} from ${selectedExpense.employeeName}`,
              read: false,
              createdAt: serverTimestamp(),
            });
          });
          
          await Promise.all(notificationPromises);
        }
      }

      toast.success(`Expense ${approvalAction === 'approve' ? (selectedExpense.status === 'pending_finance' ? 'settled' : 'approved') : (approvalAction === 'reject' ? 'rejected' : 'sent back')}`);
      setIsApprovalOpen(false);
      setComment('');
      setSettlementFile(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `expenses/${selectedExpense.id}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <Table className="min-w-[800px]">
          <TableHeader>
            <TableRow className="bg-slate-50/50">
              <TableHead className="w-[120px]">Date</TableHead>
              <TableHead className="w-[180px]">Employee</TableHead>
              <TableHead className="min-w-[250px]">Description</TableHead>
              <TableHead className="w-[130px]">Amount</TableHead>
              <TableHead className="w-[150px]">Status</TableHead>
              <TableHead className="text-right w-[150px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
        <TableBody>
          {expenses.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-12 text-slate-500">
                No expense claims found
              </TableCell>
            </TableRow>
          ) : (
            expenses.map((expense) => (
              <TableRow key={expense.id}>
                <TableCell className="text-sm">
                  {formatDate(expense.submittedAt)}
                </TableCell>
                <TableCell className="font-medium">{expense.employeeName}</TableCell>
                <TableCell className="max-w-[200px] truncate">{expense.description}</TableCell>
                <TableCell className="font-semibold">${expense.amount.toFixed(2)}</TableCell>
                <TableCell>{getStatusBadge(expense.status)}</TableCell>
                <TableCell className="text-right space-x-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="hover:bg-primary/5 hover:text-primary transition-colors"
                    onClick={() => onView?.(expense)}
                    title="View Full Claim Details"
                  >
                    <Eye className="w-5 h-5 text-slate-500" />
                  </Button>
                  {expense.status === 'needs_revision' && onEdit && expense.employeeId === user.uid && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-primary hover:bg-primary/5"
                      title="Edit/Revise Claim"
                      onClick={() => onEdit(expense)}
                    >
                      <Reply className="w-5 h-5" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>

      <Dialog open={isApprovalOpen} onOpenChange={(open) => {
        setIsApprovalOpen(open);
        if (!open) setSettlementFile(null);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {approvalAction === 'approve' 
                ? (selectedExpense?.status === 'pending_finance' ? 'Settle Expense' : 'Approve Expense') 
                : (approvalAction === 'reject' ? 'Reject Expense' : 'Send Back for Revision')}
            </DialogTitle>
            <DialogDescription>
              {approvalAction === 'send_back' 
                ? `Request the employee to correct and re-submit this claim for $${selectedExpense?.amount.toFixed(2)}.`
                : `Are you sure you want to ${approvalAction === 'approve' ? (selectedExpense?.status === 'pending_finance' ? 'settle' : 'approve') : 'reject'} this claim?`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {selectedExpense?.status === 'pending_finance' && approvalAction === 'approve' && (
              <div className="space-y-2">
                <Label>Settlement Proof (Optional)</Label>
                <div className="flex flex-col gap-2">
                  <div 
                    onClick={() => settlementFileInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-200 rounded-lg p-4 flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-primary/50 hover:bg-slate-50 transition-colors"
                  >
                    <Paperclip className="w-6 h-6 text-slate-400" />
                    <span className="text-xs text-slate-600 font-medium">Click to upload proof</span>
                    <input 
                      type="file" 
                      ref={settlementFileInputRef}
                      onChange={(e) => e.target.files?.[0] && setSettlementFile(e.target.files[0])}
                      className="hidden"
                    />
                  </div>
                  {settlementFile && (
                    <div className="flex items-center justify-between p-2 bg-green-50 rounded border border-green-100 text-xs">
                      <span className="truncate max-w-[200px] font-medium text-green-700">{settlementFile.name}</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-green-700" onClick={() => setSettlementFile(null)}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="comment">{approvalAction === 'send_back' ? 'Notes for Revision (Mandatory)' : 'Comment (Optional)'}</Label>
              <Input
                id="comment"
                placeholder={approvalAction === 'send_back' ? "Tell the employee what needs fixing..." : "Add a reason or comment..."}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                required={approvalAction === 'send_back'}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsApprovalOpen(false)}>Cancel</Button>
            <Button
              variant={approvalAction === 'approve' ? 'default' : (approvalAction === 'reject' ? 'destructive' : 'secondary')}
              onClick={handleAction}
              disabled={loading || (approvalAction === 'send_back' && !comment)}
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {approvalAction === 'approve' 
                ? (selectedExpense?.status === 'pending_finance' ? 'Confirm Settlement' : 'Confirm Approval') 
                : (approvalAction === 'reject' ? 'Confirm Rejection' : 'Confirm Send Back')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
