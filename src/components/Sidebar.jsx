import React, { useState } from "react";
import {
  FiHome,
  FiMap,
  FiLayers,
  FiSettings,
  FiGrid,
  FiMapPin,
  FiActivity,
  FiChevronsRight,
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
} from "./ui/icons";
import { motion, AnimatePresence } from "framer-motion";
import tempoLogo from '../assets/Logo_TEMPO.PNG';

const Sidebar = ({ selected, setSelected }) => {
  const [open, setOpen] = useState(true);
  const [structureOpen, setStructureOpen] = useState(true);

  return (
    <motion.nav
      layout
      className="sticky top-0 h-screen shrink-0 border-r border-black/15 bg-[#FAF8FF] p-3 flex flex-col"
      style={{
        width: open ? "240px" : "fit-content",
      }}
    >
      <TitleSection open={open} />

      <div className="space-y-1 flex-1 overflow-y-auto">
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

const Option = ({ Icon, title, selected, setSelected, open, notifs, isNested = false }) => {
  const isSelected = selected === title;
  
  return (
    <motion.button
      layout
      onClick={() => setSelected(title)}
      whileHover={{ x: 2 }}
      whileTap={{ scale: 0.98 }}
      aria-label={title}
      aria-current={isSelected ? "page" : undefined}
      className={`relative flex h-11 w-full items-center border-l-2 transition-colors duration-200 ${
        isSelected
          ? "border-black bg-surface-container-low text-black"
          : "border-transparent text-black/60 hover:text-black"
      } ${isNested ? "pl-5" : "pl-1"}`}
    >
      <motion.div
        layout
        className="grid h-full w-11 place-content-center text-lg"
      >
        <Icon />
      </motion.div>
      {open && (
        <motion.span
          layout
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
          className="text-[0.8125rem] font-semibold uppercase tracking-tight"
        >
          {title}
        </motion.span>
      )}

      {notifs && open && (
        <motion.span
          initial={{ scale: 0, opacity: 0 }}
          animate={{
            opacity: 1,
            scale: 1,
          }}
          style={{ y: "-50%" }}
          transition={{ delay: 0.5, type: "spring" }}
          className="absolute right-3 top-1/2 flex h-5 w-5 items-center justify-center rounded-full bg-black text-[10px] font-bold text-white"
        >
          {notifs}
        </motion.span>
      )}
    </motion.button>
  );
};

const DropdownSection = ({ Icon, title, open, isExpanded, setIsExpanded, children }) => {
  return (
    <div className="my-1">
      <motion.button
        layout
        onClick={() => setIsExpanded(!isExpanded)}
        whileHover={{ x: 2 }}
        aria-expanded={isExpanded}
        aria-label={title}
        className="relative flex h-11 w-full items-center border-l-2 border-transparent text-black/60 hover:text-black transition-colors duration-200"
      >
        <motion.div
          layout
          className="grid h-full w-11 place-content-center text-lg"
        >
          <Icon />
        </motion.div>
        {open && (
          <>
            <motion.span
              layout
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
              className="text-[0.8125rem] font-semibold uppercase tracking-tight flex-1 text-left"
            >
              {title}
            </motion.span>
            <motion.div
              animate={{ rotate: isExpanded ? 90 : 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="mr-3"
            >
              <FiChevronRight size={16} className="text-black/40" />
            </motion.div>
          </>
        )}
      </motion.button>
      
      <AnimatePresence>
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
    <div className="mb-4 border-b border-black/15 pb-4">
      <div className="flex cursor-pointer items-center justify-between transition-colors duration-200 p-2">
        <div className="flex items-center gap-3">
          <Logo />
          {open && (
            <motion.div
              layout
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
            >
              <span className="block text-2xl font-black uppercase tracking-tighter leading-none text-black">TEMPO</span>
              <span className="block mt-1 text-[10px] text-black/60 font-bold uppercase tracking-widest leading-snug">Tool for Energy Model Planning and Optimization</span>
            </motion.div>
          )}
        </div>
        {open && <FiChevronDown className="mr-1 text-black/40" size={16} />}
      </div>
    </div>
  );
};

const Logo = () => {
  return (
    <motion.div
      layout
      className="shrink-0 size-10 flex items-center justify-center"
    >
      <img
        src={tempoLogo}
        alt="TEMPO logo"
        className="h-10 w-10 object-contain logo-on-light"
      />
    </motion.div>
  );
};

const ToggleClose = ({ open, setOpen }) => {
  return (
    <motion.button
      layout
      onClick={() => setOpen((pv) => !pv)}
      aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
      className="border-t border-black/15 transition-colors duration-200 text-black/60 hover:text-black mt-3"
    >
      <div className="flex items-center p-2.5">
        <motion.div
          layout
          className="grid size-11 place-content-center text-lg"
        >
          <FiChevronsRight
            className={`transition-transform duration-300 ${open && "rotate-180"}`}
          />
        </motion.div>
        {open && (
          <motion.span
            layout
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
            className="text-[0.8125rem] font-semibold uppercase tracking-tight"
          >
            Hide
          </motion.span>
        )}
      </div>
    </motion.button>
  );
};

export default Sidebar;
