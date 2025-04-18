var HDProjection = DynmapProjection.extend({
	fromLocationToLatLng: function(location) {
		var wtp = this.options.worldtomap;
			lat = wtp[3] * location.x + wtp[4] * location.y + wtp[5] * location.z,
			lng = wtp[0] * location.x + wtp[1] * location.y + wtp[2] * location.z;

		return new L.LatLng(
			  -(((128 << this.options.tilescale) - lat) / (1 << this.options.mapzoomout))
			, lng / (1 << this.options.mapzoomout)
			, location.y);
	},
	fromLatLngToLocation: function(latlon, y) {
		var ptw = this.options.maptoworld,
			lat = (128 << this.options.tilescale) + latlon.lat * (1 << this.options.mapzoomout),
			lng = latlon.lng * (1 << this.options.mapzoomout),
			x = ptw[0] * lng + ptw[1] * lat + ptw[2] * y,
			z = ptw[6] * lng + ptw[7] * lat + ptw[8] * y;

		return { x: x, y: y, z: z };
	}
});

var HDMapType = DynmapTileLayer.extend({
	projection: undefined,
	options: {
		minZoom: 0,
		errorTileUrl: 'images/blank.png',
		zoomReverse: true,
		// --- Caching & Performance Tuning ---
		// Significantly increase the buffer around the viewport.
		// Default is 2. Higher values keep more tiles loaded but use more memory/CPU.
		// Experiment with values like 10, 15, 20, or even higher,
		// but monitor performance and memory usage.
		// Service Worker handles persistence, so reduce buffer back to moderate value.
		// Setting to Infinity to prevent unloading, per user request. This will increase memory usage.
		keepBuffer: Infinity, // <-- Changed from 6

		// Load tiles immediately when panning, rather than waiting for map movement to stop.
		// This can make panning feel smoother when tiles are already cached by the browser,
		// but might increase requests while actively moving if tiles aren't cached.

		// Keep fade animation disabled as in your original code.
		// Disabling it removes the fade-in effect for newly loaded tiles,
		// which can slightly improve perceived performance.
		fadeAnimation: false,

		// Set a moderate update interval. Service Worker handles updates,
		// so Leaflet doesn't need to check extremely often or rarely.
		// Default is 200ms. Let's try 300ms.
		updateInterval: 300 // ms <-- Adjusted from 200
		// --- End Caching & Performance Tuning ---
	},
	initialize: function(options) {
		// Merge instance options with the class defaults defined above
		L.Util.setOptions(this, options);

		// Set Leaflet-specific options derived from Dynmap config AFTER merging
		this.options.maxZoom = this.options.mapzoomin + this.options.mapzoomout;
		this.options.maxNativeZoom = this.options.mapzoomout;
		this.options.tileSize = 128 << (this.options.tilescale || 0);

		this.projection = new HDProjection($.extend({map: this}, this.options));

		// Call parent initialize AFTER all options are set
		DynmapTileLayer.prototype.initialize.call(this, this.options);
	},
	getTileName: function(coords) {
		var info = this.getTileInfo(coords);
		// Y is inverted for HD-map.
		info.y = -info.y;
		info.scaledy = info.y >> 5;
		return namedReplace('{prefix}{nightday}/{scaledx}_{scaledy}/{zoom}{x}_{y}.{fmt}', info);
	},
	zoomprefix: function(amount) {
		// amount == 0 -> ''
		// amount == 1 -> 'z_'
		// amount == 2 -> 'zz_'
		return 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz'.substr(0, amount) + (amount === 0 ? '' : '_');
	}
});

maptypes.HDMapType = function(options) { return new HDMapType(options); };
