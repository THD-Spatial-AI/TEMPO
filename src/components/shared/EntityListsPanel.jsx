// Shared Locations + Links list sections for the left sidebar, used by BOTH the
// Creation view and the Map View so they look and feel identical. Presentational
// only — all data and handlers are passed as props. The optional `onSave` and
// `setCurrentLinkType` props enable the Creation-only extras (Save button, new-
// link-type picker); when omitted, the panel renders the same lists without them.
import { FiArrowRight, FiChevronDown, FiEdit2, FiLink, FiMapPin, FiSave, FiTrash2 } from '../ui/icons';
import { LINK_TYPES, LINK_TYPES_BY_GROUP, getLinkTypeColor } from '../../config/linkTypes';
import { getCarrierColor } from '../../config/carriers';
import { formatTechName } from '../../utils/nameUtils';
import SelectField from '../ui/SelectField';

export default function EntityListsPanel({
  locations = [],
  links = [],
  selectedLocationId = null,
  onSelectLocation,
  onEditLocation,
  onDeleteLocation,
  onClearLocations,
  onClearLinks,
  onUpdateLink,
  onDeleteLink,
  locationsExpanded,
  setLocationsExpanded,
  linksExpanded,
  setLinksExpanded,
  onSave,                 // Creation-only: shows the Save button
  currentLinkType,        // Creation-only: new-link-type picker (with setter below)
  setCurrentLinkType,
}) {
  return (
    <div className="flex-1 overflow-y-auto px-3 py-3">
      {/* Locations Section */}
      <section className="mb-3" data-tour="entity-locations">
        <SectionHeader
          title="Locations"
          count={locations.length}
          expanded={locationsExpanded}
          onToggle={() => setLocationsExpanded(!locationsExpanded)}
        >
          {onSave && (
            <IconButton onClick={onSave} title="Save model" disabled={locations.length === 0}>
              <FiSave size={16} />
            </IconButton>
          )}
          {onClearLocations && (
            <IconButton onClick={onClearLocations} title="Clear all" danger disabled={locations.length === 0}>
              <FiTrash2 size={16} />
            </IconButton>
          )}
        </SectionHeader>

        {locationsExpanded && (
          locations.length === 0 ? (
            <EmptyState icon={FiMapPin} text="No locations yet" />
          ) : (
            <ul className="space-y-0.5">
              {locations.map((loc, index) => {
                const selected = selectedLocationId != null && selectedLocationId === loc.id;
                const techs = loc.techs ? Object.keys(loc.techs) : [];
                return (
                  <li
                    key={loc.id ?? index}
                    className={`group rounded-lg px-2 py-1.5 cursor-pointer transition-colors ${
                      selected ? 'bg-slate-100 ring-1 ring-slate-300' : 'hover:bg-slate-50'
                    }`}
                    onClick={() => onSelectLocation?.(loc, index)}
                    onDoubleClick={() => onEditLocation?.(loc, index)}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md text-[10px] font-semibold ${
                        selected ? 'bg-black text-white' : 'bg-slate-100 text-slate-600 group-hover:bg-slate-200'
                      }`}>
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium leading-tight text-slate-800">{loc.name || `Location ${index + 1}`}</div>
                        <div className="font-mono text-[10px] leading-tight text-slate-400">
                          {Number(loc.latitude).toFixed(4)}, {Number(loc.longitude).toFixed(4)}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-0.5">
                        {onEditLocation && (
                          <IconButton onClick={(e) => { e.stopPropagation(); onEditLocation(loc, index); }} title="Edit location">
                            <FiEdit2 size={16} />
                          </IconButton>
                        )}
                        {onDeleteLocation && (
                          <IconButton onClick={(e) => { e.stopPropagation(); onDeleteLocation(loc, index); }} title="Delete location" danger>
                            <FiTrash2 size={16} />
                          </IconButton>
                        )}
                      </div>
                    </div>
                    {techs.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1 pl-[34px]">
                        {techs.map(techName => (
                          <span key={techName} className="rounded bg-slate-100 px-1.5 py-px text-[10px] text-slate-600">
                            {formatTechName(techName)}
                          </span>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )
        )}
      </section>

      {/* Links Section */}
      <section className="border-t border-black/10 pt-3" data-tour="entity-links">
        <SectionHeader
          title="Links"
          count={links.length}
          expanded={linksExpanded}
          onToggle={() => setLinksExpanded(!linksExpanded)}
        >
          {onClearLinks && (
            <IconButton onClick={onClearLinks} title="Clear all links" danger disabled={links.length === 0}>
              <FiTrash2 size={16} />
            </IconButton>
          )}
        </SectionHeader>

        {/* Link type selector — Creation-only (applies to new links drawn on the map) */}
        {setCurrentLinkType && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-black/15 bg-slate-50 px-2 py-1.5" data-tour="link-type">
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-slate-400">New</span>
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: getLinkTypeColor(currentLinkType) }} />
            <SelectField
              value={currentLinkType}
              onChange={e => setCurrentLinkType(e.target.value)}
              className="min-w-0 flex-1 bg-transparent text-xs font-medium text-slate-700 focus:outline-none"
            >
              {Object.entries(LINK_TYPES_BY_GROUP).map(([group, types]) => (
                <optgroup key={group} label={group}>
                  {types.map(t => (<option key={t.id} value={t.id}>{t.label}</option>))}
                </optgroup>
              ))}
            </SelectField>
          </div>
        )}

        {linksExpanded && (
          links.length === 0 ? (
            <EmptyState icon={FiLink} text="No links yet" />
          ) : (
            <ul className="space-y-0.5">
              {links.map((link, linkIndex) => {
                const color = link.linkType ? getLinkTypeColor(link.linkType) : (link.carrier ? getCarrierColor(link.carrier) : '#6366f1');
                const distance = link.distance != null && !isNaN(parseFloat(link.distance)) ? `${parseFloat(link.distance).toFixed(2)} km` : null;
                return (
                  <li key={link.id ?? linkIndex} className="group rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-50">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                      <div className="flex min-w-0 flex-1 items-center gap-1 text-[13px] font-medium text-slate-800">
                        <span className="truncate">{link.fromName || link.from}</span>
                        <FiArrowRight size={11} className="shrink-0 text-slate-400" />
                        <span className="truncate">{link.toName || link.to}</span>
                      </div>
                      {distance && <span className="shrink-0 font-mono text-[10px] text-slate-400">{distance}</span>}
                      {onDeleteLink && (
                        <span className="shrink-0">
                          <IconButton onClick={(e) => { e.stopPropagation(); onDeleteLink(link, linkIndex); }} title="Delete link" danger>
                            <FiTrash2 size={16} />
                          </IconButton>
                        </span>
                      )}
                    </div>
                    {onUpdateLink ? (
                      <SelectField
                        value={link.linkType || ''}
                        onChange={e => {
                          const lt = e.target.value;
                          onUpdateLink(link, {
                            linkType: lt || null,
                            carrier: lt ? (LINK_TYPES[lt]?.carrier || null) : link.carrier,
                          }, linkIndex);
                        }}
                        className="ml-4 mt-0.5 w-[calc(100%-1rem)] cursor-pointer rounded bg-transparent text-[11px] text-slate-500 hover:text-slate-800 focus:outline-none"
                      >
                        <option value="">No type</option>
                        {Object.entries(LINK_TYPES_BY_GROUP).map(([group, types]) => (
                          <optgroup key={group} label={group}>
                            {types.map(t => (<option key={t.id} value={t.id}>{t.label}</option>))}
                          </optgroup>
                        ))}
                      </SelectField>
                    ) : link.linkType && (
                      <div className="ml-4 text-[11px] text-slate-500">{LINK_TYPES[link.linkType]?.label || link.linkType}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )
        )}
      </section>
    </div>
  );
}

function SectionHeader({ title, count, expanded, onToggle, children }) {
  return (
    <div className="mb-1.5 flex items-center justify-between">
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 rounded-md py-1 pr-2 text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-900"
      >
        <FiChevronDown size={14} className={`transition-transform ${expanded ? '' : '-rotate-90'}`} />
        {title}
        <span className="rounded-full bg-slate-100 px-1.5 py-px text-[10px] font-semibold normal-case tracking-normal text-slate-600">{count}</span>
      </button>
      <div className="flex gap-0.5">{children}</div>
    </div>
  );
}

function IconButton({ onClick, title, danger = false, disabled = false, children }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
      className={`grid h-[30px] w-[30px] place-items-center rounded-md text-slate-500 transition-colors disabled:pointer-events-none disabled:opacity-40 ${
        danger ? 'hover:bg-red-50 hover:text-red-600' : 'hover:bg-slate-200/70 hover:text-slate-900'
      }`}
    >
      {children}
    </button>
  );
}

function EmptyState({ icon: Icon, text }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed border-black/15 px-3 py-3 text-xs text-slate-400">
      <Icon size={14} className="shrink-0" />
      {text}
    </div>
  );
}
