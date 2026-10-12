// Material Symbols icon set (same as the landing page), bundled via the
// `material-symbols` package so icons render offline in Electron.
//
// Exports keep the old Feather names (FiHome, FiX, ...) so call sites stay
// unchanged: `<FiX size={14} className="..." />` and `Icon={FiHome}` both work.
import React from 'react';

const make = (name) => {
  const Icon = ({ size, className = '', style, ...rest }) => {
    // Feather sized itself with `size` or w-N/h-N classes; map both to font-size.
    let fontSize;
    if (size != null) fontSize = typeof size === 'number' ? `${size}px` : size;
    else {
      const m = className.match(/(?:^|\s)(?:w|size)-(\d+(?:\.5)?)(?:\s|$)/);
      if (m) fontSize = `${parseFloat(m[1]) * 0.25}rem`;
    }
    return (
      <span
        aria-hidden="true"
        {...rest}
        className={`material-symbols-outlined tempo-icon ${className}`}
        style={fontSize ? { fontSize, ...style } : style}
      >
        {name}
      </span>
    );
  };
  Icon.displayName = name;
  return Icon;
};

export const FiActivity = make('timeline');
export const FiAlertCircle = make('error');
export const FiAlertTriangle = make('warning');
export const FiArrowDown = make('arrow_downward');
export const FiArrowRight = make('arrow_forward');
export const FiArrowUp = make('arrow_upward');
export const FiAward = make('workspace_premium');
export const FiBarChart2 = make('bar_chart');
export const FiBattery = make('battery_full');
export const FiBook = make('menu_book');
export const FiBox = make('deployed_code');
export const FiCalendar = make('calendar_today');
export const FiCheck = make('check');
export const FiCheckCircle = make('check_circle');
export const FiCheckSquare = make('check_box');
export const FiChevronDown = make('keyboard_arrow_down');
export const FiChevronLeft = make('chevron_left');
export const FiChevronRight = make('chevron_right');
export const FiChevronsRight = make('keyboard_double_arrow_right');
export const FiChevronUp = make('keyboard_arrow_up');
export const FiCircle = make('radio_button_unchecked');
export const FiClock = make('schedule');
export const FiCloud = make('cloud');
export const FiCopy = make('content_copy');
export const FiCpu = make('memory');
export const FiCrosshair = make('my_location');
export const FiDatabase = make('database');
export const FiDollarSign = make('attach_money');
export const FiDownload = make('download');
export const FiDownloadCloud = make('cloud_download');
export const FiDroplet = make('water_drop');
export const FiEdit = make('edit_square');
export const FiEdit2 = make('edit');
export const FiEdit3 = make('edit_note');
export const FiExternalLink = make('open_in_new');
export const FiEye = make('visibility');
export const FiFile = make('draft');
export const FiFileText = make('description');
export const FiFilter = make('filter_alt');
export const FiFolder = make('folder');
export const FiGitMerge = make('merge');
export const FiGlobe = make('public');
export const FiGrid = make('grid_view');
export const FiHelpCircle = make('help');
export const FiHome = make('home');
export const FiInfo = make('info');
export const FiLayers = make('layers');
export const FiLink = make('link');
export const FiList = make('list');
export const FiLoader = make('progress_activity');
export const FiMap = make('map');
export const FiMapPin = make('location_on');
export const FiMaximize2 = make('open_in_full');
export const FiMessageSquare = make('chat');
export const FiMinimize2 = make('close_fullscreen');
export const FiNavigation = make('near_me');
export const FiPackage = make('package_2');
export const FiPieChart = make('pie_chart');
export const FiPlay = make('play_arrow');
export const FiPlus = make('add');
export const FiRefreshCw = make('refresh');
export const FiSave = make('save');
export const FiSearch = make('search');
export const FiSend = make('send');
export const FiServer = make('dns');
export const FiSettings = make('settings');
export const FiShare2 = make('share');
export const FiShield = make('shield');
export const FiSliders = make('tune');
export const FiSquare = make('check_box_outline_blank');
export const FiStar = make('star');
export const FiStopCircle = make('stop_circle');
export const FiSun = make('sunny');
export const FiTerminal = make('terminal');
export const FiTrash2 = make('delete');
export const FiTrendingUp = make('trending_up');
export const FiUpload = make('upload');
export const FiUploadCloud = make('cloud_upload');
export const FiWind = make('air');
export const FiX = make('close');
export const FiZap = make('bolt');
export const FiZoomIn = make('zoom_in');
export const FiZoomOut = make('zoom_out');
