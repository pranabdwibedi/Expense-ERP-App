import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { ShieldCheck, Info, XCircle, CheckCircle2, AlertCircle } from 'lucide-react';

export function ExpensePolicy() {
  const policies = [
    {
      title: "Allowed Expenses",
      icon: <CheckCircle2 className="w-5 h-5 text-green-500" />,
      items: [
        "Business travel tickets (Economy class)",
        "Hotel stay during official tours",
        "Meals during business meetings (subject to daily limits)",
        "Office supplies and consumables",
        "Approved software subscriptions",
        "Internet/mobile bills for remote work (as per department ceiling)"
      ]
    },
    {
      title: "Non-Reimbursable (Strictly Prohibited)",
      icon: <XCircle className="w-5 h-5 text-red-500" />,
      items: [
        "Non-vegetarian meals (Company policy for sustainability/culture)",
        "Alcoholic beverages and tobacco products",
        "Personal grooming and luxury items",
        "Traffic fines and penalties",
        "Personal flight upgrades",
        "Expenses without valid commercial receipts"
      ]
    },
    {
      title: "Submission Guidelines",
      icon: <Info className="w-5 h-5 text-blue-500" />,
      items: [
        "All claims must be submitted within 30 days of the transaction.",
        "Clear digital copies of original invoices are mandatory.",
        "Detailed descriptions must be provided for 'Other' category expenses.",
        "Multi-item claims should be grouped by trip or event where possible."
      ]
    }
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold text-slate-900">Corporate Expense Policy</h2>
        <p className="text-slate-500">Standard operating procedures for reimbursement and claims.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {policies.slice(0, 2).map((policy, idx) => (
          <Card key={idx} className="border-t-4 border-t-slate-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {policy.icon}
                {policy.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {policy.items.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-1.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-blue-50 border-blue-100">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-900">
            {policies[2].icon}
            {policies[2].title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {policies[2].items.map((item, i) => (
              <div key={i} className="flex items-center gap-3 p-3 bg-white rounded-lg border border-blue-100 shadow-sm">
                <ShieldCheck className="w-4 h-4 text-blue-500 shrink-0" />
                <span className="text-sm text-slate-700 font-medium">{item}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-amber-900">Important Note</p>
          <p className="text-sm text-amber-800">
            Falsifying claims or submitting duplicate receipts is a violation of company integrity guidelines and may lead to disciplinary action.
          </p>
        </div>
      </div>
    </div>
  );
}
