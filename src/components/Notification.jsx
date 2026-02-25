import { AnimatePresence, motion } from "framer-motion";
import { FiAlertCircle, FiX, FiCheckCircle, FiAlertTriangle, FiInfo } from "react-icons/fi";
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
          bg: "bg-gray-600",
          icon: FiCheckCircle,
          iconBg: "bg-white text-gray-600"
        };
      case "error":
        return {
          bg: "bg-gray-600",
          icon: FiAlertCircle,
          iconBg: "bg-white text-gray-600"
        };
      case "warning":
        return {
          bg: "bg-gray-600",
          icon: FiAlertTriangle,
          iconBg: "bg-white text-gray-600"
        };
      case "info":
      default:
        return {
          bg: "bg-gray-600",
          icon: FiInfo,
          iconBg: "bg-white text-gray-600"
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
      className={`p-4 w-80 flex items-start rounded-lg gap-2 text-sm font-medium shadow-lg text-white ${style.bg} fixed z-[9999] top-4 right-4`}
    >
      <IconComponent className={`text-3xl absolute -top-4 -left-4 p-2 rounded-full ${style.iconBg} shadow`} />
      <span className="flex-1">{text}</span>
      <button onClick={() => removeNotif(id)} className="ml-auto mt-0.5 hover:opacity-70 transition-opacity">
        <FiX />
      </button>
    </motion.div>
  );
};

export default Notification;
