import { BellRing, Banknote, Barcode, BookUser, CalendarDays, ClipboardCheck, Clock, DatabaseBackup, FileX, Gauge, HandCoins, Hash, IdCard, Lock, LockKeyhole, Mail, MessageSquare, MessageSquareText, Package, QrCode, Receipt, Save, Search, ShieldCheck, Shield, Table, Tag, Trash2, Type, Warehouse, Ban, type LucideIcon } from "lucide-react";

// One icon per add-on, matching the feature list. Anything not listed falls back to a tag icon.
const ICONS: Record<string, LucideIcon> = {
  "Advanced Address Book": BookUser,
  "Audit Trail with Stock Items": ClipboardCheck,
  "Auto E-mail Facility Module": Mail,
  "Auto Narration Suggestion Module": MessageSquareText,
  "Auto-save Reference Number for Transactions": Hash,
  "Bulk Backup in Tally": DatabaseBackup,
  "Cheque No. Tracking": Receipt,
  "Credit Control based on Days": Gauge,
  "Default Godown in Vouchers": Warehouse,
  "Disable Delete and Cancel Command": Ban,
  "Disable on Account": Shield,
  "Extract PAN from GSTIN": IdCard,
  "Find Party Name from GSTIN": Search,
  "HSN & SAC Code with GST Rate in Invoice": Barcode,
  "Lines and Borders in Reports": Table,
  "Lock Opening Balances": LockKeyhole,
  "Month-wise Expense Summary": CalendarDays,
  "Negative Cash Control": HandCoins,
  "Negative Stock Control": Package,
  "QR Code on Invoice for Payment": QrCode,
  "Recycle Bin for Restoring Deleted Vouchers": Trash2,
  "Stock Items Lock": Lock,
  "Stop Invoice without GSTIN": FileX,
  "Stop Cash Transaction above ₹10,000": Banknote,
  "Stop Transaction without Narration": MessageSquare,
  "Tally Font Change": Type,
  "Tally Locking Period": Clock,
  "Task Reminder": BellRing,
  "User Configured Backup": Save,
  "Voucher Type Security": ShieldCheck,
};

// Covers with no uploaded image: a navy tile with the add-on's icon centred. No logo on covers.
export default function ProductCover({ title, className }: { title: string; className?: string }) {
  const Icon = ICONS[title] ?? Tag;
  return <span className={`cover-fallback cover-product ${className ?? ""}`} role="img" aria-label={`Cover of ${title}`}>
    <Icon aria-hidden="true" className="cover-product-icon" />
  </span>;
}
