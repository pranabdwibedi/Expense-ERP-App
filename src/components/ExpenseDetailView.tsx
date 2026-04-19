import React, { useState } from 'react';
import { UserProfile, ExpenseClaim, ExpenseStatus, AuditEntry } from '../types';
import { db, handleFirestoreError, OperationType, storage } from '../firebase';
import { doc, updateDoc, addDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { toast } from 'sonner';
import { 
  CheckCircle2, XCircle, History, Loader2, FileText, 
  Paperclip, ArrowLeft, Reply, Check, X, Info, Download, 
  User as UserIcon, Calendar, Tag, CreditCard
} from 'lucide-react';
import { formatDate } from '../lib/date-utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './ui/dialog';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Separator } from './ui/separator';

interface ExpenseDetailViewProps {
  user: UserProfile;
  expense: ExpenseClaim;
  onClose: () => void;
}

export function ExpenseDetailView({ user, expense, onClose }: ExpenseDetailViewProps) {
  const [loading, setLoading] = useState(false);
  const [isApprovalOpen, setIsApprovalOpen] = useState(false);
  const [approvalAction, setApprovalAction] = useState<'approve' | 'reject' | 'send_back'>('approve');
  const [comment, setComment] = useState('');
  const [settlementFile, setSettlementFile] = useState<File | null>(null);
  const settlementFileInputRef = React.useRef<HTMLInputElement>(null);

  const getStatusBadge = (status: ExpenseStatus) => {
    switch (status) {
      case 'pending_manager': return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Pending Manager</Badge>;
      case 'pending_ceo': return <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">Pending CEO</Badge>;
      case 'pending_finance': return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Pending Finance</Badge>;
      case 'settled': return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Settled</Badge>;
      case 'rejected': return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Rejected</Badge>;
      case 'needs_revision': return <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-300">Needs Revision</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const canApprove = () => {
    if (expense.status === 'rejected' || expense.status === 'settled') return false;
    if (user.role === 'admin') return true;
    if (user.role === 'manager' && expense.status === 'pending_manager') return true;
    if (user.role === 'ceo' && expense.status === 'pending_ceo') return true;
    if (user.role === 'finance' && expense.status === 'pending_finance') return true;
    return false;
  };

  const handleAction = async () => {
    setLoading(true);
    try {
      let nextStatus: ExpenseStatus = expense.status;
      if (approvalAction === 'reject') {
        nextStatus = 'rejected';
      } else if (approvalAction === 'send_back') {
        nextStatus = 'needs_revision';
      } else {
        if (expense.status === 'pending_manager') nextStatus = 'pending_ceo';
        else if (expense.status === 'pending_ceo') nextStatus = 'pending_finance';
        else if (expense.status === 'pending_finance') nextStatus = 'settled';
      }

      const audit: AuditEntry = {
        action: approvalAction === 'approve' ? (expense.status === 'pending_finance' ? 'Settled' : 'Approved') : (approvalAction === 'reject' ? 'Rejected' : 'Sent Back for Revision'),
        actorId: user.uid,
        actorName: user.name,
        timestamp: new Date().toISOString(),
        comment: comment,
      };

      let settlementProofUrl = '';
      let settlementProofName = '';

      if (expense.status === 'pending_finance' && approvalAction === 'approve' && settlementFile) {
        const storageRef = ref(storage, `settlements/${expense.id}/${Date.now()}_${settlementFile.name}`);
        const uploadResult = await uploadBytes(storageRef, settlementFile);
        settlementProofUrl = await getDownloadURL(uploadResult.ref);
        settlementProofName = settlementFile.name;
      }

      const updateData: any = {
        status: nextStatus,
        history: [...expense.history, audit],
      };

      if (settlementProofUrl) {
        updateData.settlementProofUrl = settlementProofUrl;
        updateData.settlementProofName = settlementProofName;
      }

      await updateDoc(doc(db, 'expenses', expense.id), updateData);

      await addDoc(collection(db, 'notifications'), {
        userId: expense.employeeId,
        message: `Your expense claim for $${expense.amount} was ${approvalAction === 'approve' ? 'approved' : (approvalAction === 'reject' ? 'rejected' : 'sent back for revision')} by ${user.name}.`,
        read: false,
        createdAt: serverTimestamp(),
      });

      if (approvalAction === 'approve' && nextStatus !== 'settled') {
        let nextRole = '';
        if (nextStatus === 'pending_ceo') nextRole = 'ceo';
        else if (nextStatus === 'pending_finance') nextRole = 'finance';

        if (nextRole) {
          const q = query(collection(db, 'users'), where('role', '==', nextRole));
          const querySnapshot = await getDocs(q);
          const notificationPromises = querySnapshot.docs.map(userDoc => {
            return addDoc(collection(db, 'notifications'), {
              userId: userDoc.id,
              message: `New expense claim pending your approval: $${expense.amount} from ${expense.employeeName}`,
              read: false,
              createdAt: serverTimestamp(),
            });
          });
          await Promise.all(notificationPromises);
        }
      }

      toast.success(`Expense ${approvalAction === 'approve' ? (expense.status === 'pending_finance' ? 'settled' : 'approved') : (approvalAction === 'reject' ? 'rejected' : 'sent back')}`);
      setIsApprovalOpen(false);
      setComment('');
      setSettlementFile(null);
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `expenses/${expense.id}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Navigation & Actions Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onClose}
            className="flex items-center gap-2 text-slate-500 hover:text-slate-900"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Button>
          <Separator orientation="vertical" className="h-6 hidden sm:block" />
          <div className="flex flex-col">
            <h2 className="text-sm font-bold text-slate-900">Claim #{expense.id?.slice(0, 8)}</h2>
            <p className="text-[10px] text-slate-500 font-medium uppercase tracking-tight">{formatDate(expense.submittedAt, 'MMM dd, yyyy')}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canApprove() ? (
            <div className="flex items-center gap-2 w-full sm:w-auto">
              {user.role === 'manager' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setApprovalAction('send_back'); setIsApprovalOpen(true); }}
                  className="flex-1 sm:flex-none h-9 border-amber-200 text-amber-600 hover:bg-amber-50"
                >
                  <Reply className="w-4 h-4 mr-2" />
                  Send Back
                </Button>
              )}
              <Button
                variant="destructive"
                size="sm"
                onClick={() => { setApprovalAction('reject'); setIsApprovalOpen(true); }}
                className="flex-1 sm:flex-none h-9"
              >
                <XCircle className="w-4 h-4 mr-2" />
                Reject
              </Button>
              <Button
                size="sm"
                onClick={() => { setApprovalAction('approve'); setIsApprovalOpen(true); }}
                className="flex-1 sm:flex-none h-9 bg-emerald-600 hover:bg-emerald-700"
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Approve
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400 font-bold uppercase mr-2">Current Status:</span>
              {getStatusBadge(expense.status)}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Summary & Items */}
        <div className="lg:col-span-2 space-y-6">
          {/* Summary Card */}
          <Card className="border-slate-200 shadow-sm overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900">Expense Overview</CardTitle>
                  <CardDescription>Primary details and justification</CardDescription>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Total Amount</p>
                  <div className="text-3xl font-bold text-slate-900 tabular-nums">
                    ${expense.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-slate-100 rounded-lg">
                      <UserIcon className="w-4 h-4 text-slate-600" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Employee</p>
                      <p className="text-sm font-semibold text-slate-900">{expense.employeeName}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-slate-100 rounded-lg">
                      <Calendar className="w-4 h-4 text-slate-600" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Submitted On</p>
                      <p className="text-sm font-semibold text-slate-900">{formatDate(expense.submittedAt, 'MMMM dd, yyyy')}</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-slate-100 rounded-lg">
                      <Tag className="w-4 h-4 text-slate-600" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Units</p>
                      <p className="text-sm font-semibold text-slate-900">{expense.items.length} Line Items</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-slate-100 rounded-lg">
                      <CreditCard className="w-4 h-4 text-slate-600" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Current Status</p>
                      <div className="mt-1">{getStatusBadge(expense.status)}</div>
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <Info className="w-3 h-3" />
                  Reason for Expenditure
                </p>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 italic">
                  <p className="text-sm font-medium text-slate-600 leading-relaxed">
                    "{expense.description || 'No additional justification provided.'}"
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Itemized Table Card */}
          <Card className="border-slate-200 shadow-sm overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b pb-4">
              <CardTitle className="text-base font-bold text-slate-900">Itemized Breakdown</CardTitle>
              <CardDescription>Detailed list of incurred expenses</CardDescription>
            </CardHeader>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/30">
                    <TableHead className="text-[10px] font-bold uppercase h-12 pl-6">Merchant & Date</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase h-12">Category</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase h-12 text-center">Receipt</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase h-12 text-right pr-6">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expense.items.map((item, idx) => (
                    <TableRow key={item.id || idx} className="hover:bg-slate-50/50 transition-colors">
                      <TableCell className="pl-6 py-3">
                        <p className="text-sm font-semibold text-slate-900 mb-0.5">{item.merchant}</p>
                        <p className="text-[10px] text-slate-400 font-medium uppercase">{item.date}</p>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-white text-[10px] font-medium border-slate-200">
                          {item.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {item.attachmentUrl ? (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-primary" asChild>
                            <a href={item.attachmentUrl} target="_blank" rel="noopener noreferrer">
                              <Paperclip className="w-4 h-4" />
                            </a>
                          </Button>
                        ) : (
                          <span className="text-slate-200 text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right pr-6 font-bold tabular-nums text-slate-900">
                        ${item.amount.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </div>

        {/* Right Column: Artifacts & History */}
        <div className="space-y-6">
          {/* Artifacts Card */}
          <Card className="border-slate-200 shadow-sm overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b pb-4">
              <CardTitle className="text-base font-bold text-slate-900">Supporting Data</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              {expense.attachmentUrl ? (
                <div className="flex items-center gap-4 p-3 bg-white border border-slate-100 rounded-lg group hover:border-primary/30 transition-all shadow-sm">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-700 truncate">{expense.attachmentName || 'Master Receipt'}</p>
                    <a href={expense.attachmentUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline font-bold uppercase flex items-center gap-1 mt-0.5">
                      <Download className="w-3 h-3" /> Download
                    </a>
                  </div>
                </div>
              ) : (
                <div className="p-6 border-2 border-dashed border-slate-100 rounded-xl text-center bg-slate-50/30">
                  <Paperclip className="w-6 h-6 text-slate-200 mx-auto mb-2" />
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">No master proof uploaded</p>
                </div>
              )}

              {expense.settlementProofUrl && (
                <div className="flex items-center gap-4 p-3 bg-emerald-50 border border-emerald-100 rounded-lg">
                  <div className="w-10 h-10 rounded-lg bg-emerald-600 flex items-center justify-center text-white">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-emerald-900 truncate">Payment Settled</p>
                    <a href={expense.settlementProofUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-emerald-600 hover:underline font-bold uppercase flex items-center gap-1 mt-0.5">
                      <Download className="w-3 h-3" /> Receipt
                    </a>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* History Card */}
          <Card className="border-slate-200 shadow-sm overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b pb-4">
              <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                <History className="w-4 h-4 text-slate-500" />
                Audit Trail
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 relative">
              <div className="absolute left-[2.4rem] top-8 bottom-8 w-[1px] bg-slate-100" />
              <div className="space-y-6">
                {expense.history.map((entry, idx) => (
                  <div key={idx} className="relative flex gap-4 pl-2 group">
                    <div className="relative z-10 w-8 h-8 rounded-full bg-white border border-slate-100 flex items-center justify-center shrink-0 shadow-sm group-hover:border-primary transition-colors">
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-200 group-hover:bg-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col mb-1">
                        <span className="text-xs font-bold text-slate-900 leading-none">{entry.action}</span>
                        <span className="text-[10px] text-slate-400 font-medium uppercase mt-1">{formatDate(entry.timestamp, 'MMM dd, p')}</span>
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-5 h-5 rounded-md bg-slate-100 text-slate-500 flex items-center justify-center text-[9px] font-bold">{entry.actorName.charAt(0)}</div>
                        <span className="text-[10px] text-slate-600 font-bold">{entry.actorName}</span>
                      </div>
                      {entry.comment && (
                        <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-lg text-xs text-slate-600 font-medium italic border-l-2 border-l-primary">
                          "{entry.comment}"
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Approval Dialog */}
      <Dialog open={isApprovalOpen} onOpenChange={(open) => {
        setIsApprovalOpen(open);
        if (!open) setSettlementFile(null);
      }}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>
              {approvalAction === 'approve' 
                ? (expense.status === 'pending_finance' ? 'Confirm Settlement' : 'Confirm Approval') 
                : (approvalAction === 'reject' ? 'Confirm Rejection' : 'Revision Request')}
            </DialogTitle>
            <DialogDescription className="text-sm">
              {approvalAction === 'send_back' 
                ? `Please provide instructions for the employee.`
                : `Are you sure you want to proceed with this action?`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {expense.status === 'pending_finance' && approvalAction === 'approve' && (
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-700">Proof of Payment</Label>
                <div 
                  onClick={() => settlementFileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-100 rounded-xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-primary/20 hover:bg-slate-50 transition-all"
                >
                  <Paperclip className="w-5 h-5 text-slate-300" />
                  <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Select Proof File</span>
                  <input 
                    type="file" 
                    ref={settlementFileInputRef}
                    onChange={(e) => e.target.files?.[0] && setSettlementFile(e.target.files[0])}
                    className="hidden"
                  />
                </div>
                {settlementFile && (
                  <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-lg border border-emerald-100">
                    <span className="text-xs font-bold text-emerald-700 truncate">{settlementFile.name}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-emerald-700" onClick={() => setSettlementFile(null)}>
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="comment" className="text-xs font-bold text-slate-700">
                {approvalAction === 'send_back' ? 'Instructions (Required)' : 'Notes (Optional)'}
              </Label>
              <Input
                id="comment"
                placeholder="..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="h-10 text-sm"
                required={approvalAction === 'send_back'}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setIsApprovalOpen(false)} className="h-10 text-sm font-bold flex-1">Cancel</Button>
            <Button
              variant={approvalAction === 'approve' ? 'default' : (approvalAction === 'reject' ? 'destructive' : 'secondary')}
              onClick={handleAction}
              disabled={loading || (approvalAction === 'send_back' && !comment)}
              className={`h-10 text-sm font-bold flex-1 ${approvalAction === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}`}
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
