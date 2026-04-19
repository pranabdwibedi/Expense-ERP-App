import React, { useState, useEffect } from 'react';
import { UserProfile, ExpenseClaim } from '../types';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { ExpenseForm } from './ExpenseForm';
import { ExpenseList } from './ExpenseList';
import { ReportGenerator } from './ReportGenerator';
import { UserManagement } from './UserManagement';
import { UserProfileSettings } from './UserProfileSettings';
import { ExpensePolicy } from './ExpensePolicy';
import { ExpenseDetailView } from './ExpenseDetailView';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Plus, FileText, BarChart3, History, Settings, XCircle, User as UserIcon, Wallet, CheckCircle2, AlertCircle, PieChart, Info } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';

interface ExpenseDashboardProps {
  user: UserProfile;
  onUserUpdate: (updatedUser: UserProfile) => void;
}

export function ExpenseDashboard({ user, onUserUpdate }: ExpenseDashboardProps) {
  const [expenses, setExpenses] = useState<ExpenseClaim[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [activeTab, setActiveTab] = useState('list');
  const [editingClaim, setEditingClaim] = useState<ExpenseClaim | null>(null);
  const [viewingClaim, setViewingClaim] = useState<ExpenseClaim | null>(null);
  const [isPolicyOpen, setIsPolicyOpen] = useState(false);

  useEffect(() => {
    const usersQ = query(collection(db, 'users'));
    const unsubscribeUsers = onSnapshot(usersQ, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data() } as UserProfile));
      // Deduplicate by email to prevent duplicate key errors
      const uniqueUsers = data.reduce((acc: UserProfile[], current) => {
        const x = acc.find(item => 
          item.email && current.email && 
          item.email.toLowerCase() === current.email.toLowerCase()
        );
        if (!x) {
          return acc.concat([current]);
        } else {
          return acc;
        }
      }, []);
      setAllUsers(uniqueUsers);
    });

    return () => unsubscribeUsers();
  }, []);

  useEffect(() => {
    let q;
    if (user.role === 'admin' || user.role === 'finance') {
      q = query(collection(db, 'expenses'), orderBy('submittedAt', 'desc'));
    } else if (user.role === 'manager') {
      // Managers see their own and their subordinates' expenses
      // For simplicity in this demo, managers see all to approve
      q = query(collection(db, 'expenses'), orderBy('submittedAt', 'desc'));
    } else if (user.role === 'ceo') {
      q = query(collection(db, 'expenses'), where('status', '==', 'pending_ceo'), orderBy('submittedAt', 'desc'));
    } else {
      q = query(collection(db, 'expenses'), where('employeeId', '==', user.uid), orderBy('submittedAt', 'desc'));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ExpenseClaim));
      setExpenses(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'expenses');
    });

    return () => unsubscribe();
  }, [user]);

  const stats = {
    total: expenses.length,
    pending: expenses.filter(e => e.status.startsWith('pending')).length,
    settled: expenses.filter(e => e.status === 'settled').length,
    rejected: expenses.filter(e => e.status === 'rejected').length,
    totalAmount: expenses.filter(e => e.status !== 'rejected').reduce((acc, curr) => acc + curr.amount, 0),
    pendingAmount: expenses.filter(e => e.status.startsWith('pending')).reduce((acc, curr) => acc + curr.amount, 0),
    settledAmount: expenses.filter(e => e.status === 'settled').reduce((acc, curr) => acc + curr.amount, 0),
  };

  const activeClaims = expenses.filter(e => e.status !== 'rejected');
  const rejectedClaims = expenses.filter(e => e.status === 'rejected');

  const canViewReports = user.role === 'admin' || user.role === 'manager' || user.role === 'ceo';

  if (viewingClaim) {
    return (
      <ExpenseDetailView 
        user={user}
        expense={viewingClaim}
        onClose={() => setViewingClaim(null)}
      />
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-primary shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <div>
              <CardTitle className="text-sm font-medium text-slate-500">Total Volume</CardTitle>
              <CardDescription className="text-[10px]">All non-rejected claims</CardDescription>
            </div>
            <Wallet className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${stats.totalAmount.toLocaleString()}</div>
            <p className="text-xs text-slate-400 mt-1">{stats.total} total submissions</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <div>
              <CardTitle className="text-sm font-medium text-slate-500">Pending Approval</CardTitle>
              <CardDescription className="text-[10px]">Awaiting review</CardDescription>
            </div>
            <History className="w-4 h-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">${stats.pendingAmount.toLocaleString()}</div>
            <p className="text-xs text-amber-500/80 mt-1">{stats.pending} claims in queue</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <div>
              <CardTitle className="text-sm font-medium text-slate-500">Settled Amount</CardTitle>
              <CardDescription className="text-[10px]">Paid out to employees</CardDescription>
            </div>
            <CheckCircle2 className="w-4 h-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">${stats.settledAmount.toLocaleString()}</div>
            <p className="text-xs text-green-500/80 mt-1">{stats.settled} claims completed</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-500 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <div>
              <CardTitle className="text-sm font-medium text-slate-500">Rejected</CardTitle>
              <CardDescription className="text-[10px]">Claims not approved</CardDescription>
            </div>
            <AlertCircle className="w-4 h-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.rejected}</div>
            <p className="text-xs text-red-400 mt-1">Requires re-submission</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <TabsList className="bg-slate-100/50 p-1">
            <TabsTrigger value="list" className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Claims
            </TabsTrigger>
            {(user.role === 'employee' || user.role === 'admin' || user.role === 'manager') && (
              <TabsTrigger value="new" className="flex items-center gap-2" onClick={() => setEditingClaim(null)}>
                <Plus className="w-4 h-4" />
                <span className="whitespace-nowrap">{editingClaim ? 'Edit Claim' : 'Add New Claim'}</span>
              </TabsTrigger>
            )}
            <TabsTrigger value="rejected" className="flex items-center gap-2">
              <XCircle className="w-4 h-4" />
              Rejected
            </TabsTrigger>
            {canViewReports && (
              <TabsTrigger value="reports" className="flex items-center gap-2">
                <PieChart className="w-4 h-4" />
                Reports
              </TabsTrigger>
            )}
            {user.role === 'admin' && (
              <TabsTrigger value="users" className="flex items-center gap-2">
                <Settings className="w-4 h-4" />
                Users
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        <TabsContent value="list" className="mt-0 text-left">
          <ExpenseList 
            user={user} 
            expenses={activeClaims} 
            onEdit={(claim) => {
              setEditingClaim(claim);
              setActiveTab('new');
            }}
            onView={(claim) => setViewingClaim(claim)}
          />
        </TabsContent>

        <TabsContent value="rejected" className="mt-0 text-left">
          <ExpenseList 
            user={user} 
            expenses={rejectedClaims} 
            onView={(claim) => setViewingClaim(claim)}
          />
        </TabsContent>

        <TabsContent value="new" className="mt-0">
          <ExpenseForm 
            key={editingClaim?.id || 'new-claim'}
            user={user} 
            prefillClaim={editingClaim}
            onPolicyClick={() => setIsPolicyOpen(true)}
            onSuccess={() => {
              setEditingClaim(null);
              setActiveTab('list');
            }}
          />
        </TabsContent>

        {canViewReports && (
          <TabsContent value="reports" className="mt-0">
            <ReportGenerator expenses={expenses} user={user} allUsers={allUsers} />
          </TabsContent>
        )}

        {user.role === 'admin' && (
          <TabsContent value="users" className="mt-0">
            <UserManagement />
          </TabsContent>
        )}
      </Tabs>

      <Dialog open={isPolicyOpen} onOpenChange={setIsPolicyOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Info className="w-5 h-5 text-primary" />
              Company Expense Policy
            </DialogTitle>
          </DialogHeader>
          <ExpensePolicy />
        </DialogContent>
      </Dialog>
    </div>
  );
}

