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

  const getNotificationStyle = () => {
    switch (type) {
      case "success":
        return {
          bg: "bg-primary",
          icon: FiCheckCircle,
          iconBg: "bg-white text-black border border-black"
        };
      case "error":
        return {
          bg: "bg-primary",
          icon: FiAlertCircle,
          iconBg: "bg-white text-black border border-black"
        };
      case "warning":
        return {
          bg: "bg-primary",
          icon: FiAlertTriangle,
          iconBg: "bg-white text-black border border-black"
        };
      case "info":
      default:
        return {
          bg: "bg-primary",
          icon: FiInfo,
          iconBg: "bg-white text-black border border-black"
        };
    }
  };

  const style = getNotificationStyle();
  const IconComponent = style.icon;

  return (
    <motion.div
      layout
      initial={{ y: -15, scale: 0.95, opacity: 0 }}
      animate={{ y: 0, scale: 1, opacity: 1 }}
      exit={{ x: 400, opacity: 0 }}
      transition={{ 
        type: "spring",
        stiffness: 400,
        damping: 30
      }}
      className={`p-4 w-80 flex items-start gap-2 text-sm font-medium shadow-lg text-white ${style.bg} fixed z-[9999] right-4`}
      style={{ top: 'calc(var(--titlebar-h, 0px) + 24px)' }}
    >
      <span className={`absolute -top-3 -left-3 grid h-7 w-7 place-items-center ${style.iconBg}`}>
        <IconComponent size={16} />
      </span>
      <span className="flex-1">{text}</span>
      <button onClick={() => removeNotif(id)} className="ml-auto mt-0.5 hover:opacity-70 transition-opacity">
        <FiX />
      </button>
    </motion.div>
  );
};

export default Notification;
