import React, { useState, useMemo } from 'react';
import { ExpenseClaim, UserProfile } from '../types';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Download, FileSpreadsheet, Filter, X } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import Papa from 'papaparse';
import { format } from 'date-fns';

interface ReportGeneratorProps {
  expenses: ExpenseClaim[];
  user: UserProfile;
  allUsers: UserProfile[];
}

export function ReportGenerator({ expenses, user, allUsers }: ReportGeneratorProps) {
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    category: 'all',
    status: 'all',
    employeeId: 'all',
  });

  const filteredExpenses = useMemo(() => {
    let result = [...expenses];

    // Manager specific view: only see subordinates
    if (user.role === 'manager') {
      const subordinateIds = allUsers
        .filter(u => u.managerId === user.uid || u.managerId === user.email)
        .map(u => u.uid);
      result = result.filter(e => subordinateIds.includes(e.employeeId) || e.employeeId === user.uid);
    }

    if (filters.startDate) {
      result = result.filter(e => {
        const date = (e.submittedAt as any)?.toDate ? (e.submittedAt as any).toDate() : new Date(e.submittedAt);
        return date >= new Date(filters.startDate);
      });
    }

    if (filters.endDate) {
      result = result.filter(e => {
        const date = (e.submittedAt as any)?.toDate ? (e.submittedAt as any).toDate() : new Date(e.submittedAt);
        const end = new Date(filters.endDate);
        end.setHours(23, 59, 59, 999);
        return date <= end;
      });
    }

    if (filters.category !== 'all') {
      result = result.filter(e => (e as any).category === filters.category || (e.items && e.items.some(item => item.category === filters.category)));
    }

    if (filters.status !== 'all') {
      result = result.filter(e => e.status === filters.status);
    }

    if (filters.employeeId !== 'all') {
      result = result.filter(e => e.employeeId === filters.employeeId);
    }

    return result;
  }, [expenses, filters, user, allUsers]);

  const exportCSV = () => {
    const data = filteredExpenses.map(e => ({
      Date: e.submittedAt ? format((e.submittedAt as any).toDate ? (e.submittedAt as any).toDate() : new Date(e.submittedAt), 'yyyy-MM-dd') : '',
      Employee: e.employeeName,
      Amount: e.amount,
      Status: e.status,
      Description: e.description,
      LineItems: e.items?.length || 0,
      SettlementProof: e.settlementProofUrl || 'N/A'
    }));

    const csv = Papa.unparse(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `expense_report_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportPDF = () => {
    const doc = new jsPDF() as any;
    
    doc.setFontSize(18);
    doc.text('Expense Transaction Report', 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Generated on: ${format(new Date(), 'PPP p')}`, 14, 30);
    doc.text(`Filtered Count: ${filteredExpenses.length}`, 14, 36);

    const tableData = filteredExpenses.map(e => [
      e.submittedAt ? format((e.submittedAt as any).toDate ? (e.submittedAt as any).toDate() : new Date(e.submittedAt), 'MMM dd, yyyy') : '',
      e.employeeName,
      `$${e.amount.toFixed(2)}`,
      e.items?.length || 0,
      e.status.replace('_', ' ').toUpperCase()
    ]);

    autoTable(doc, {
      startY: 42,
      head: [['Date', 'Employee', 'Total Amount', 'Items', 'Status']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [79, 70, 229] },
    });

    doc.save(`expense_report_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  const resetFilters = () => {
    setFilters({
      startDate: '',
      endDate: '',
      category: 'all',
      status: 'all',
      employeeId: 'all',
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Report Filters
          </CardTitle>
          <CardDescription>Narrow down the data for your report.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input 
                type="date" 
                className="bg-white"
                value={filters.startDate} 
                onChange={(e) => setFilters({...filters, startDate: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label>End Date</Label>
              <Input 
                type="date" 
                className="bg-white"
                value={filters.endDate} 
                onChange={(e) => setFilters({...filters, endDate: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={filters.category} onValueChange={(v) => setFilters({...filters, category: v})}>
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="Travel">Travel</SelectItem>
                  <SelectItem value="Meals">Meals</SelectItem>
                  <SelectItem value="Office Supplies">Office Supplies</SelectItem>
                  <SelectItem value="Software">Software</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={filters.status} onValueChange={(v) => setFilters({...filters, status: v})}>
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending_manager">Pending Manager</SelectItem>
                  <SelectItem value="pending_ceo">Pending CEO</SelectItem>
                  <SelectItem value="pending_finance">Pending Finance</SelectItem>
                  <SelectItem value="settled">Settled</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="needs_revision">Needs Revision</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Employee</Label>
              <Select value={filters.employeeId} onValueChange={(v) => setFilters({...filters, employeeId: v})}>
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="All Employees" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Employees</SelectItem>
                  {allUsers.map(u => (
                    <SelectItem key={`${u.email}-${u.uid}`} value={u.uid}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end mt-4">
            <Button variant="ghost" size="sm" onClick={resetFilters} className="text-slate-500 hover:bg-slate-100">
              <X className="w-4 h-4 mr-2" />
              Reset Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Export Reports</CardTitle>
          <CardDescription>
            Showing {filteredExpenses.length} claims based on current filters.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          <Button onClick={exportCSV} variant="outline" className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4" />
            Export as CSV
          </Button>
          <Button onClick={exportPDF} variant="outline" className="flex items-center gap-2">
            <Download className="w-4 h-4" />
            Export as PDF
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
