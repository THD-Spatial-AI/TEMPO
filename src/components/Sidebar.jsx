import React, { useState } from "react";
import { createPortal } from "react-dom";
import {
  FiHome,
  FiMap,
  FiLayers,
  FiSettings,
  FiGrid,
  FiMapPin,
  FiActivity,
  FiChevronDown,
  FiChevronRight,
  FiFolder,
  FiCpu,
  FiBarChart2,
  FiEdit,
  FiBook,
  FiDownload,
  FiPlay,
  FiPieChart,
} from "react-icons/fi";
import { LuPanelLeftClose, LuPanelLeftOpen } from "react-icons/lu";
import { motion, AnimatePresence } from "framer-motion";
import tempoLogo from '../assets/Logo_TEMPO.PNG';

const WIDTH_OPEN = 240;
const WIDTH_CLOSED = 72;
const EASE = [0.4, 0, 0.2, 1];
const LABEL_TRANSITION = { duration: 0.18, ease: "easeOut" };

const Sidebar = ({ selected, setSelected }) => {
  const [open, setOpen] = useState(true);
  const [structureOpen, setStructureOpen] = useState(true);

  return (
    <motion.nav
      initial={false}
      animate={{ width: open ? WIDTH_OPEN : WIDTH_CLOSED }}
      transition={{ duration: 0.3, ease: EASE }}
      className="sticky top-0 h-screen shrink-0 overflow-hidden border-r border-slate-200 bg-white/80 backdrop-blur-xl p-3 shadow-sm flex flex-col"
    >
      <TitleSection open={open} />

      <div className="space-y-1 flex-1 overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Option
          Icon={FiHome}
          title="Dashboard"
          selected={selected}
          setSelected={setSelected}
          open={open}
        />
        <Option
          Icon={FiBook}
          title="Tutorial"
          selected={selected}
          setSelected={setSelected}
          open={open}
        />
        <Option
          Icon={FiEdit}
          title="Creation"
          selected={selected}
          setSelected={setSelected}
          open={open}
        />

        {/* Structure Dropdown Section */}
        <DropdownSection
          Icon={FiFolder}
          title="Structure"
          open={open}
          setOpen={setOpen}
          isExpanded={structureOpen}
          setIsExpanded={setStructureOpen}
        >
          <Option
            Icon={FiGrid}
            title="Models"
            selected={selected}
            setSelected={setSelected}
            open={open}
            isNested
          />
          <Option
            Icon={FiMap}
            title="Map View"
            selected={selected}
            setSelected={setSelected}
            open={open}
            isNested
          />
          <Option
            Icon={FiMapPin}
            title="Locations"
            selected={selected}
            setSelected={setSelected}
            open={open}
            isNested
          />
          <Option
            Icon={FiActivity}
            title="Links"
            selected={selected}
            setSelected={setSelected}
            open={open}
            isNested
          />
          <Option
            Icon={FiBarChart2}
            title="TimeSeries"
            selected={selected}
            setSelected={setSelected}
            open={open}
            isNested
          />
          <Option
            Icon={FiLayers}
            title="Scenarios"
            selected={selected}
            setSelected={setSelected}
            open={open}
            isNested
          />
        </DropdownSection>

        <Option
          Icon={FiCpu}
          title="Tech Database"
          selected={selected}
          setSelected={setSelected}
          open={open}
        />
        <Option
          Icon={FiDownload}
          title="Export"
          selected={selected}
          setSelected={setSelected}
          open={open}
        />
        <Option
          Icon={FiPlay}
          title="Run"
          selected={selected}
          setSelected={setSelected}
          open={open}
        />
        <Option
          Icon={FiPieChart}
          title="Results"
          selected={selected}
          setSelected={setSelected}
          open={open}
        />
        <Option
          Icon={FiSettings}
          title="Settings"
          selected={selected}
          setSelected={setSelected}
          open={open}
        />

      </div>

      <ToggleClose open={open} setOpen={setOpen} />
    </motion.nav>
  );
};

// Portal tooltip so the nav's overflow can't clip it.
const useCollapsedTooltip = (label, enabled) => {
  const [pos, setPos] = useState(null);
  const visible = enabled && pos;

  const show = (e) => {
    if (!enabled) return;
    const r = e.currentTarget.getBoundingClientRect();
    setPos({ top: r.top + r.height / 2, left: r.right + 10 });
  };
  const hide = () => setPos(null);

  const tooltip = createPortal(
    <AnimatePresence>
      {visible && (
        <motion.div
          role="tooltip"
          initial={{ opacity: 0, x: -4 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -4 }}
          transition={{ duration: 0.12, ease: "easeOut" }}
          className="pointer-events-none fixed z-[100000] -translate-y-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg"
          style={{ top: pos.top, left: pos.left }}
        >
          <span className="absolute -left-1 top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 bg-slate-900" />
          {label}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );

  return {
    tooltip,
    handlers: { onMouseEnter: show, onMouseLeave: hide, onFocus: show, onBlur: hide },
  };
};

const Label = ({ open, className = "", children }) => (
  <AnimatePresence initial={false}>
    {open && (
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { ...LABEL_TRANSITION, delay: 0.1 } }}
        exit={{ opacity: 0, transition: { duration: 0.1 } }}
        className={`whitespace-nowrap ${className}`}
      >
        {children}
      </motion.span>
    )}
  </AnimatePresence>
);

const Option = ({ Icon, title, selected, setSelected, open, notifs, isNested = false }) => {
  const isSelected = selected === title;
  const { tooltip, handlers } = useCollapsedTooltip(title, !open);

  return (
    <>
      <motion.button
        onClick={() => setSelected(title)}
        whileHover={{ x: 2 }}
        whileTap={{ scale: 0.98 }}
        aria-label={title}
        aria-current={isSelected ? "page" : undefined}
        {...handlers}
        className={`relative flex h-11 w-full items-center rounded-xl transition-colors duration-200 ${
          isSelected
            ? "bg-gradient-to-r from-electric-500 to-electric-600 text-white shadow-md"
            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
        } ${isNested ? "pl-5" : "pl-0.5"}`}
      >
        <div className="grid h-full w-11 shrink-0 place-content-center text-lg">
          <Icon className={isSelected ? "drop-shadow" : ""} />
        </div>
        <Label open={open} className={`text-sm font-medium ${isSelected ? "font-semibold" : ""}`}>
          {title}
        </Label>

        {notifs && open && (
          <motion.span
            initial={{ scale: 0, opacity: 0 }}
            animate={{
              opacity: 1,
              scale: 1,
            }}
            style={{ y: "-50%" }}
            transition={{ delay: 0.5, type: "spring" }}
            className="absolute right-3 top-1/2 flex h-5 w-5 items-center justify-center rounded-full bg-gray-500 text-[10px] font-bold text-white shadow-sm"
          >
            {notifs}
          </motion.span>
        )}
      </motion.button>
      {tooltip}
    </>
  );
};

const DropdownSection = ({ Icon, title, open, setOpen, isExpanded, setIsExpanded, children }) => {
  const { tooltip, handlers } = useCollapsedTooltip(title, !open);

  const handleClick = () => {
    if (!open) {
      setOpen(true);
      setIsExpanded(true);
    } else {
      setIsExpanded(!isExpanded);
    }
  };

  return (
    <div className="my-1">
      <motion.button
        onClick={handleClick}
        whileHover={{ x: 2 }}
        aria-expanded={isExpanded}
        aria-label={title}
        {...handlers}
        className="relative flex h-11 w-full items-center rounded-xl pl-0.5 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors duration-200"
      >
        <div className="grid h-full w-11 shrink-0 place-content-center text-lg">
          <Icon />
        </div>
        <Label open={open} className="text-sm font-medium flex-1 text-left">
          {title}
        </Label>
        {open && (
          <motion.div
            animate={{ rotate: isExpanded ? 90 : 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="mr-3"
          >
            <FiChevronRight size={16} className="text-slate-400" />
          </motion.div>
        )}
      </motion.button>
      {tooltip}

      <AnimatePresence initial={false}>
        {isExpanded && open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden space-y-0.5 mt-1"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const TitleSection = ({ open }) => {
  return (
    <div className="mb-4 border-b border-slate-200 pb-4">
      <div className="flex cursor-pointer items-center justify-between rounded-xl transition-colors duration-200 hover:bg-slate-50 py-2 pl-1 pr-2">
        <div className="flex min-w-0 items-center gap-3">
          <Logo />
          <AnimatePresence initial={false}>
            {open && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { ...LABEL_TRANSITION, delay: 0.1 } }}
                exit={{ opacity: 0, transition: { duration: 0.1 } }}
                className="w-[150px] shrink-0"
              >
                <span className="block text-sm font-bold bg-gradient-to-r from-electric-500 to-electric-900 bg-clip-text text-transparent">TEMPO</span>
                <span className="block text-[11px] text-slate-500 font-medium tracking-wide">Tool for Energy Model Planning and Optimization</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {open && <FiChevronDown className="mr-1 shrink-0 text-slate-400" size={16} />}
      </div>
    </div>
  );
};

const Logo = () => {
  return (
    <div className="shrink-0 size-10 flex items-center justify-center">
      <img
        src={tempoLogo}
        alt="TEMPO logo"
        className="h-10 w-10 object-contain"
        style={{ mixBlendMode: 'multiply' }}
      />
    </div>
  );
};

const ToggleClose = ({ open, setOpen }) => {
  const { tooltip, handlers } = useCollapsedTooltip("Expand sidebar", !open);
  const ToggleIcon = open ? LuPanelLeftClose : LuPanelLeftOpen;

  return (
    <>
      <button
        onClick={() => setOpen((pv) => !pv)}
        aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
        {...handlers}
        className="mt-3 border-t border-slate-200 pt-2"
      >
        <div className="flex h-11 items-center rounded-xl pl-0.5 text-slate-500 transition-colors duration-200 hover:bg-slate-50 hover:text-slate-900">
          <div className="grid h-full w-11 shrink-0 place-content-center">
            <ToggleIcon size={19} strokeWidth={1.75} />
          </div>
          <Label open={open} className="text-sm font-medium">
            Hide
          </Label>
        </div>
      </button>
      {tooltip}
    </>
  );
};

export default Sidebar;
