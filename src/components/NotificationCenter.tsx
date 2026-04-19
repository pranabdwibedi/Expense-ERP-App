import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, writeBatch, getDocs } from 'firebase/firestore';
import { Notification } from '../types';
import { Bell, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { toast } from 'sonner';
import { formatRelative } from '../lib/date-utils';
import { cn } from '../lib/utils';
import { buttonVariants } from './ui/button';

interface NotificationCenterProps {
  userId: string;
}

export function NotificationCenter({ userId }: NotificationCenterProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const unreadCount = notifications.filter(n => !n.read).length;

  useEffect(() => {
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notification));
      setNotifications(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'notifications');
    });

    return () => unsubscribe();
  }, [userId]);

  const markAsRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'notifications', id), { read: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `notifications/${id}`);
    }
  };

  const clearAll = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'notifications'), where('userId', '==', userId));
      const snapshot = await getDocs(q);
      const batch = writeBatch(db);
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      await batch.commit();
      toast.success('Notifications cleared');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'notifications');
    } finally {
      setLoading(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "relative")}>
        <Bell className="w-5 h-5 text-slate-600" />
        {unreadCount > 0 && (
          <Badge className="absolute -top-1 -right-1 px-1.5 py-0.5 min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white border-2 border-white text-[10px]">
            {unreadCount}
          </Badge>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-96 overflow-y-auto p-0">
        <div className="p-4 border-bottom border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">Notifications</h3>
          {notifications.length > 0 && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={(e) => {
                e.stopPropagation();
                clearAll();
              }}
              disabled={loading}
              className="h-7 text-xs text-slate-500 hover:text-red-600 flex items-center gap-1 px-2"
            >
              <Trash2 className="w-3 h-3" />
              Clear All
            </Button>
          )}
        </div>
        {notifications.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">
            No notifications yet
          </div>
        ) : (
          notifications.map(notification => (
            <DropdownMenuItem
              key={notification.id}
              className={`p-4 flex flex-col items-start gap-1 cursor-pointer border-bottom border-slate-50 last:border-0 ${!notification.read ? 'bg-blue-50/30' : ''}`}
              onClick={() => markAsRead(notification.id)}
            >
              <p className={`text-sm ${!notification.read ? 'font-medium text-slate-900' : 'text-slate-600'}`}>
                {notification.message}
              </p>
              <p className="text-xs text-slate-400">
                {formatRelative(notification.createdAt)}
              </p>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
