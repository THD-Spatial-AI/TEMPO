-- Energy Infrastructure Views for GeoServer
-- Run after osm2pgsql import completes

-- Drop existing views if they exist
DROP VIEW IF EXISTS osm_substations CASCADE;
DROP VIEW IF EXISTS osm_power_plants CASCADE;
DROP VIEW IF EXISTS osm_power_lines CASCADE;
DROP VIEW IF EXISTS osm_communes CASCADE;
DROP VIEW IF EXISTS osm_districts CASCADE;

-- 1. Substations (Electricity Distribution Points)
CREATE OR REPLACE VIEW osm_substations AS
SELECT 
  osm_id,
  name,
  power,
  tags->'voltage' as voltage,
  tags->'substation' as substation,
  operator,
  way as geom
FROM planet_osm_point
WHERE power = 'substation';

COMMENT ON VIEW osm_substations IS 'Electricity substations from OSM data';

-- 2. Power Plants (Generation Facilities)
CREATE OR REPLACE VIEW osm_power_plants AS
SELECT 
  osm_id,
  name,
  power,
  power_source,
  tags->'generator:source' as generator_source,
  tags->'plant:source' as plant_source,
  tags->'generator:output:electricity' as output_mw,
  operator,
  way as geom
FROM planet_osm_point
WHERE power IN ('plant', 'generator');

COMMENT ON VIEW osm_power_plants IS 'Power generation facilities from OSM data';

-- 3. Power Lines (Transmission Infrastructure)
CREATE OR REPLACE VIEW osm_power_lines AS
SELECT 
  osm_id,
  name,
  power,
  tags->'voltage' as voltage,
  tags->'cables' as cables,
  tags->'wires' as wires,
  tags->'frequency' as frequency,
  operator,
  way as geom
FROM planet_osm_line
WHERE power IN ('line', 'cable', 'minor_line');

COMMENT ON VIEW osm_power_lines IS 'Power transmission lines from OSM data';

-- 4. Communes (Administrative Level 8)
CREATE OR REPLACE VIEW osm_communes AS
SELECT 
  osm_id,
  name,
  admin_level,
  boundary,
  way as geom
FROM planet_osm_polygon
WHERE boundary = 'administrative' AND admin_level = '8';

COMMENT ON VIEW osm_communes IS 'Municipal boundaries (admin_level=8) from OSM data';

-- 5. Districts (Administrative Level 6)
CREATE OR REPLACE VIEW osm_districts AS
SELECT 
  osm_id,
  name,
  admin_level,
  boundary,
  way as geom
FROM planet_osm_polygon
WHERE boundary = 'administrative' AND admin_level = '6';

COMMENT ON VIEW osm_districts IS 'District boundaries (admin_level=6) from OSM data';

-- Indexes are already created by osm2pgsql on the underlying tables
-- (planet_osm_point, planet_osm_line, planet_osm_polygon)
-- No need to create indexes on views

-- Verify the views
SELECT 
  'osm_substations' as view_name,
  COUNT(*) as feature_count
FROM osm_substations
UNION ALL
SELECT 
  'osm_power_plants' as view_name,
  COUNT(*) as feature_count
FROM osm_power_plants
UNION ALL
SELECT 
  'osm_power_lines' as view_name,
  COUNT(*) as feature_count
FROM osm_power_lines
UNION ALL
SELECT 
  'osm_communes' as view_name,
  COUNT(*) as feature_count
FROM osm_communes
UNION ALL
SELECT 
  'osm_districts' as view_name,
  COUNT(*) as feature_count
FROM osm_districts;

-- Success message
SELECT 'All views created successfully! Ready for GeoServer publishing.' as status;
