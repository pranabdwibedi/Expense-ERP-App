import React, { useState, useRef } from 'react';
import { UserProfile, ExpenseClaim, AuditEntry, ExpenseItem } from '../types';
import { db, storage, handleFirestoreError, OperationType } from '../firebase';
import { collection, addDoc, serverTimestamp, getDocs, query, where, doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { toast } from 'sonner';
import { Loader2, Send, Paperclip, X, FileIcon, Plus, Trash2, HelpCircle } from 'lucide-react';

interface ExpenseFormProps {
  user: UserProfile;
  onPolicyClick?: () => void;
  prefillClaim?: ExpenseClaim | null;
  onSuccess?: () => void;
  key?: React.Key;
}

export function ExpenseForm({ user, onPolicyClick, prefillClaim, onSuccess }: ExpenseFormProps) {
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [description, setDescription] = useState(prefillClaim?.description || '');
  const [items, setItems] = useState<(Partial<ExpenseItem> & { tempFile?: File | null })[]>(
    prefillClaim?.items.map(item => ({ ...item, tempFile: null })) || [
      { id: Math.random().toString(36).substr(2, 9), category: '', amount: 0, merchant: '', date: new Date().toISOString().split('T')[0], description: '', tempFile: null }
    ]
  );
  const [existingAttachment, setExistingAttachment] = useState<{url: string, name: string} | null>(
    prefillClaim?.attachmentUrl ? { url: prefillClaim.attachmentUrl, name: prefillClaim.attachmentName || 'Attachment' } : null
  );

  const addItem = () => {
    setItems([...items, { id: Math.random().toString(36).substr(2, 9), category: '', amount: 0, merchant: '', date: new Date().toISOString().split('T')[0], description: '', tempFile: null }]);
  };

  const removeItem = (id: string) => {
    if (items.length <= 1) return;
    setItems(items.filter(item => item.id !== id));
  };

  const updateItem = (id: string, field: keyof ExpenseItem | 'tempFile', value: any) => {
    setItems(items.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const totalAmount = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

  const validateFile = (file: File) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    
    if (!allowedTypes.includes(file.type)) {
      toast.error('Invalid file type. Please upload an image, PDF, or Word document.');
      return false;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size exceeds 5MB limit.');
      return false;
    }
    return true;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (validateFile(selectedFile)) {
        setFile(selectedFile);
      }
    }
  };

  const handleItemFileChange = (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (validateFile(selectedFile)) {
        updateItem(id, 'tempFile', selectedFile);
      }
    }
  };

  const removeFile = () => {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!description) {
      toast.error('Please provide a general description for the claim');
      return;
    }

    const isAllItemsValid = items.every(item => item.category && item.amount && item.merchant && item.date);
    if (!isAllItemsValid) {
      toast.error('Please fill in all details for each line item');
      return;
    }

    setLoading(true);
    try {
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const allUsers = usersSnapshot.docs.map(doc => doc.data() as UserProfile);
      const manager = allUsers.find(u => u.uid === user.managerId || u.email === user.managerId);

      let initialStatus: any = 'pending_manager';
      if (manager?.role === 'ceo') {
        initialStatus = 'pending_ceo';
      }

      let attachmentUrl = '';
      let attachmentName = '';

      if (file) {
        const storageRef = ref(storage, `expenses/${user.uid}/${Date.now()}_${file.name}`);
        const uploadResult = await uploadBytes(storageRef, file);
        attachmentUrl = await getDownloadURL(uploadResult.ref);
        attachmentName = file.name;
      }

      const audit: AuditEntry = {
        action: prefillClaim ? 'Resubmitted after Revision' : 'Submitted',
        actorId: user.uid,
        actorName: user.name,
        timestamp: new Date().toISOString(),
        comment: prefillClaim ? 'Revised and resubmitted' : (initialStatus === 'pending_ceo' ? 'Submitted (Direct CEO Report)' : 'Initial submission'),
      };

      const processedItems = await Promise.all(items.map(async (item) => {
        let itemUrl = item.attachmentUrl || '';
        let itemName = item.attachmentName || '';

        if (item.tempFile) {
          const itemStorageRef = ref(storage, `expenses/${user.uid}/items/${item.id}_${Date.now()}_${item.tempFile.name}`);
          const uploadResult = await uploadBytes(itemStorageRef, item.tempFile);
          itemUrl = await getDownloadURL(uploadResult.ref);
          itemName = item.tempFile.name;
        }

        const { tempFile, ...cleanItem } = item;
        return {
          ...cleanItem,
          attachmentUrl: itemUrl,
          attachmentName: itemName
        };
      }));

      const expenseData: any = {
        employeeId: user.uid,
        employeeName: user.name,
        amount: totalAmount,
        description: description,
        status: initialStatus,
        history: prefillClaim ? [...prefillClaim.history, audit] : [audit],
        items: processedItems,
      };

      if (!prefillClaim) {
        expenseData.submittedAt = serverTimestamp();
      } else {
        expenseData.lastUpdatedAt = serverTimestamp();
      }

      if (attachmentUrl) {
        expenseData.attachmentUrl = attachmentUrl;
        expenseData.attachmentName = attachmentName;
      } else if (existingAttachment) {
        expenseData.attachmentUrl = existingAttachment.url;
        expenseData.attachmentName = existingAttachment.name;
      }

      if (prefillClaim) {
        await updateDoc(doc(db, 'expenses', prefillClaim.id), expenseData);
      } else {
        await addDoc(collection(db, 'expenses'), expenseData);
      }
      
      const targetId = user.managerId;
      if (targetId) {
        await addDoc(collection(db, 'notifications'), {
          userId: targetId,
          message: `${prefillClaim ? 'Revised' : 'New'} multi-item expense claim from ${user.name} for $${totalAmount}`,
          read: false,
          createdAt: serverTimestamp(),
        });
      }

      toast.success(prefillClaim ? 'Claim resubmitted successfully' : 'Expense claim submitted successfully');
      
      if (onSuccess) {
        onSuccess();
      } else {
        setItems([{ id: Math.random().toString(36).substr(2, 9), category: '', amount: 0, merchant: '', date: new Date().toISOString().split('T')[0], description: '' }]);
        setDescription('');
        setFile(null);
        setExistingAttachment(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    } catch (error) {
      handleFirestoreError(error, prefillClaim ? OperationType.UPDATE : OperationType.CREATE, prefillClaim ? `expenses/${prefillClaim.id}` : 'expenses');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="max-w-4xl mx-auto shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 bg-slate-50/50 rounded-t-xl">
        <div>
          <CardTitle className="text-xl">Expense Reimbursement Form</CardTitle>
          <CardDescription>Submit multiple expenses in a single claim.</CardDescription>
        </div>
        {onPolicyClick && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onPolicyClick}
            className="text-primary flex items-center gap-1.5 hover:bg-primary/5"
          >
            <HelpCircle className="w-4 h-4" />
            <span className="underline font-medium">View Expense Policy</span>
          </Button>
        )}
      </CardHeader>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="space-y-2">
            <Label htmlFor="main-description" className="text-sm font-semibold">General Purpose / Trip Name <span className="text-red-500">*</span></Label>
            <Input
              id="main-description"
              placeholder="e.g. Sales Trip to New York, Tech Conference Attendance"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="h-11"
              required
            />
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                Line Items
                <span className="text-xs font-normal text-slate-500">({items.length} total)</span>
              </h3>
              <Button type="button" variant="outline" size="sm" onClick={addItem} className="h-8">
                <Plus className="w-3.5 h-3.5 mr-1" />
                Add Item
              </Button>
            </div>

            <div className="space-y-4">
              {items.map((item, index) => (
                <div key={item.id} className="p-4 bg-slate-50 rounded-xl border border-slate-200 relative group animate-in slide-in-from-top-2 duration-300">
                  {items.length > 1 && (
                    <button 
                      type="button"
                      onClick={() => removeItem(item.id!)}
                      className="absolute -top-2 -right-2 p-1 bg-white border border-slate-200 rounded-full text-slate-400 hover:text-red-500 hover:border-red-500 shadow-sm transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] uppercase font-bold text-slate-500">Merchant <span className="text-red-500">*</span></Label>
                      <Input
                        placeholder="e.g. Amazon, Uber"
                        value={item.merchant}
                        onChange={(e) => updateItem(item.id!, 'merchant', e.target.value)}
                        className="bg-white h-9"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] uppercase font-bold text-slate-500">Date <span className="text-red-500">*</span></Label>
                      <Input
                        type="date"
                        value={item.date}
                        onChange={(e) => updateItem(item.id!, 'date', e.target.value)}
                        className="bg-white py-0"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] uppercase font-bold text-slate-500">Category <span className="text-red-500">*</span></Label>
                      <Select
                        value={item.category}
                        onValueChange={(value) => updateItem(item.id!, 'category', value)}
                      >
                        <SelectTrigger className="bg-white">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Travel">Travel</SelectItem>
                          <SelectItem value="Stay">Stay</SelectItem>
                          <SelectItem value="Food">Food</SelectItem>
                          <SelectItem value="Office Supplies">Office Supplies</SelectItem>
                          <SelectItem value="Software">Software</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] uppercase font-bold text-slate-500">Amount ($) <span className="text-red-500">*</span></Label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={item.amount || ''}
                        onChange={(e) => updateItem(item.id!, 'amount', parseFloat(e.target.value))}
                        className="bg-white"
                        required
                      />
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-[10px] uppercase font-bold text-slate-500">Item Description</Label>
                      <Input
                        placeholder="Specific detail about this line item..."
                        value={item.description}
                        onChange={(e) => updateItem(item.id!, 'description', e.target.value)}
                        className="bg-white"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase font-bold text-slate-500">Item Receipt</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <input 
                          type="file" 
                          id={`file-${item.id}`}
                          className="hidden"
                          onChange={(e) => handleItemFileChange(item.id!, e)}
                          accept=".jpg,.jpeg,.png,.pdf,.doc,.docx"
                        />
                        {item.tempFile || item.attachmentUrl ? (
                          <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg shadow-sm flex-1">
                            <FileIcon className="w-3.5 h-3.5 text-primary shrink-0" />
                            <span className="text-xs font-medium text-slate-700 truncate max-w-[150px]">
                              {item.tempFile?.name || item.attachmentName || 'Receipt Attached'}
                            </span>
                            <button 
                              type="button" 
                              onClick={() => {
                                updateItem(item.id!, 'tempFile', null);
                                updateItem(item.id!, 'attachmentUrl', '');
                                updateItem(item.id!, 'attachmentName', '');
                              }} 
                              className="text-slate-400 hover:text-red-500 ml-auto"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <Button 
                            type="button" 
                            variant="outline" 
                            size="sm" 
                            onClick={() => document.getElementById(`file-${item.id}`)?.click()} 
                            className="bg-white hover:bg-slate-50 border-dashed w-full"
                          >
                            <Paperclip className="w-3.5 h-3.5 mr-1.5" />
                            Attach Receipt
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between p-4 bg-primary/5 rounded-xl border border-primary/10 gap-4">
            <div className="text-sm font-medium text-slate-600">
              Total Claim Amount: <span className="text-xl font-bold text-primary ml-1">${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="flex items-center gap-2">
              <input 
                type="file" 
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                accept=".jpg,.jpeg,.png,.pdf,.doc,.docx"
              />
              {file || existingAttachment ? (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg shadow-sm">
                  <FileIcon className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-medium text-slate-700 truncate max-w-[100px]">{file?.name || existingAttachment?.name}</span>
                  <button type="button" onClick={() => {
                    if (file) removeFile();
                    else setExistingAttachment(null);
                  }} className="text-slate-400 hover:text-red-500">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="h-9">
                  <Paperclip className="w-3.5 h-3.5 mr-1.5" />
                  Attach Receipts
                </Button>
              )}
            </div>
          </div>

          <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={loading}>
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
            ) : (
              <Send className="w-5 h-5 mr-2" />
            )}
            Submit Comprehensive Claim
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

