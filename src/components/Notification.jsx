import { AnimatePresence, motion } from "framer-motion";
import { FiAlertCircle, FiX, FiCheckCircle, FiAlertTriangle, FiInfo } from "./ui/icons";
import { useEffect } from "react";

const NOTIFICATION_TTL = 5000;

const Notification = ({ text, id, removeNotif, type = "info" }) => {
  useEffect(() => {
    const timeoutRef = setTimeout(() => {
      removeNotif();
    }, NOTIFICATION_TTL);

    return () => clearTimeout(timeoutRef);
  }, [removeNotif]);

  const TYPES = {
    success: { icon: FiCheckCircle, label: 'Success', tint: 'bg-emerald-400/15 text-emerald-300', bar: 'bg-emerald-400' },
    error: { icon: FiAlertCircle, label: 'Error', tint: 'bg-red-400/15 text-red-300', bar: 'bg-red-400' },
    warning: { icon: FiAlertTriangle, label: 'Warning', tint: 'bg-amber-400/15 text-amber-300', bar: 'bg-amber-400' },
    info: { icon: FiInfo, label: 'Info', tint: 'bg-sky-400/15 text-sky-300', bar: 'bg-sky-400' },
  };
  const style = TYPES[type] || TYPES.info;
  const IconComponent = style.icon;

  return (
    <motion.div
      layout
      role="status"
      initial={{ y: -15, scale: 0.95, opacity: 0 }}
      animate={{ y: 0, scale: 1, opacity: 1 }}
      exit={{ x: 400, opacity: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="fixed right-4 z-[9999] w-[340px] overflow-hidden bg-slate-950 text-white shadow-2xl shadow-slate-950/30 ring-1 ring-white/10"
      style={{ top: 'calc(var(--titlebar-h, 0px) + 16px)' }}
    >
      <div className="flex items-start gap-3 p-3.5 pr-2.5">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${style.tint}`}>
          <IconComponent size={18} />
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-white/50">{style.label}</div>
          <div className="mt-0.5 text-sm font-medium leading-snug text-white">{text}</div>
        </div>
        <button onClick={() => removeNotif(id)} aria-label="Dismiss notification"
          className="grid h-7 w-7 shrink-0 place-items-center text-white/50 transition-colors hover:bg-white/10 hover:text-white">
          <FiX size={15} />
        </button>
      </div>
      <motion.div
        className={`h-0.5 origin-left ${style.bar}`}
        initial={{ scaleX: 1 }}
        animate={{ scaleX: 0 }}
        transition={{ duration: NOTIFICATION_TTL / 1000, ease: 'linear' }}
      />
    </motion.div>
  );
};

export default Notification;
