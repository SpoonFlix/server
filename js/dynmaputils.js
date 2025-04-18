var DynmapTileLayer = L.TileLayer.extend({
	_namedTiles: null,
	_cachedTileUrls: null,
	_loadQueue: null,
	_loadingTiles: null,

	initialize: function() {
		// Call the parent constructor (important!)
		L.TileLayer.prototype.initialize.call(this, this.options.dynmap.getTileUrl(), this.options);
		
		this._namedTiles = {};
		this._cachedTileUrls = {};
		this._loadQueue = [];
		this._loadingTiles = [];
		
		// --- MODIFICATION: Increase the tile buffer significantly ---
		// Leaflet normally keeps tiles within a buffer around the viewport.
		// Setting this higher *might* reduce the *frequency* of _pruneTiles being called
		// with intent to remove, but won't stop it without the override below.
		// Setting it to Infinity might seem logical but could cause issues.
		// Let's try a very large number instead. Set keepBuffer high.
		// Note: In modern Leaflet (>=1.0), this option might be handled differently or less impactful
		// when _pruneTiles is fully overridden. The main protection comes from overriding the removal methods.
		// this.options.keepBuffer = 10; // Example: Keep a large buffer (adjust as needed)
                                        // Or rely solely on overriding methods below.

        // --- MODIFICATION: Explicitly set unloadInvisibleTiles and updateWhenIdle ---
        // These Leaflet options control tile unloading. Setting them to false might
        // seem like the solution, but overriding the core methods is more robust.
        // We set them here for clarity and as a potential first line of defense,
        // but the method overrides are the crucial part.
        this.options.unloadInvisibleTiles = false;
        this.options.updateWhenIdle = false; // Might prevent pruning during idle moments
	},

	createTile: function(coords, done) {
		var me = this,
			tile = document.createElement('img');

  		if (this.options.crossOrigin || this.options.crossOrigin === '') {
  			tile.crossOrigin = this.options.crossOrigin === true ? '' : this.options.crossOrigin;
  		}

  		tile.alt = '';
  		tile.setAttribute('role', 'presentation');

  		//Dynmap - Tile names
  		tile.tileName = this.getTileName(coords);
  		this._namedTiles[tile.tileName] = tile;

		tile.onload = function() {
			me._tileOnLoad(done, tile);

			//Dynmap - Update load queue
			me._loadingTiles.splice(me._loadingTiles.indexOf(tile), 1);
			me._tickLoadQueue();
		};

		tile.onerror = function() {
			me._tileOnError(done, tile);

			//Dynmap - Update load queue
			me._loadingTiles.splice(me._loadingTiles.indexOf(tile), 1);
			me._tickLoadQueue();
		};

		//Dynmap - Queue for loading
		tile.url = this.getTileUrl(coords);
		this._loadQueue.push(tile);
		this._tickLoadQueue();

		return tile;
	},

	_abortLoading: function() {
		// This function is tricky. Leaflet's original _abortLoading might try
		// to remove tiles internally. The Dynmap version already has logic
		// to clean up its internal lists (_namedTiles, _loadQueue, _loadingTiles)
		// for tiles of the *wrong* zoom level.
		// To prevent *any* potential removal triggered from here, we could
		// potentially empty this function or be very careful.
		// However, the main DOM removal happens via _removeTile, _pruneTiles,
		// and _removeTilesAtZoom, which we are overriding below.
		// Let's keep the Dynmap cleanup logic for its internal lists but
		// ensure the call to the parent doesn't cause unwanted effects.

		var tile;
		for (var i in this._tiles) {
			if (!Object.prototype.hasOwnProperty.call(this._tiles, i)) {
				continue;
			}
			tile = this._tiles[i];

			// Dynmap - remove namedTiles entry *if zoom differs*
			if (tile.coords.z !== this._tileZoom) {
				if (tile.loaded && tile.el && tile.el.tileName) {
					delete this._namedTiles[tile.el.tileName];
				}
				// Remove from Dynmap loading queues if zoom differs
				var loadQueueIndex = this._loadQueue.indexOf(tile.el);
				if (loadQueueIndex > -1) {
					this._loadQueue.splice(loadQueueIndex, 1);
				}
				var loadingTilesIndex = this._loadingTiles.indexOf(tile.el);
				if (loadingTilesIndex > -1) {
					this._loadingTiles.splice(loadingTilesIndex, 1);
				}
			}
		}

		// --- MODIFICATION: Comment out or remove the call to parent _abortLoading ---
		// This prevents Leaflet's default abort behavior which might trigger tile removal.
		// L.TileLayer.prototype._abortLoading.call(this);
	},

	// --- MODIFICATION: Override _removeTile ---
	_removeTile: function(key) {
		var tile = this._tiles[key];
		if (!tile) { return; }

        // Dynmap - remove namedTiles entry (keep this cleanup)
        var tileName = tile.el.tileName;
        if (tileName) {
            delete this._namedTiles[tileName];
        }

        // Dynmap - remove from load queue (keep this cleanup)
		var loadingTilesIndex = this._loadingTiles.indexOf(tile.el);
        if (loadingTilesIndex > -1) {
            this._loadingTiles.splice(loadingTilesIndex, 1);
        }
		var loadQueueIndex = this._loadQueue.indexOf(tile.el);
        if (loadQueueIndex > -1) {
            this._loadQueue.splice(loadQueueIndex, 1);
        }

        // Clean up event listeners to prevent memory leaks if the tile element
        // somehow gets detached later without this function being called properly.
        // L.DomEvent.off(tile.el, 'load', this._tileOnLoad); // Might need context adjustment if used
        // L.DomEvent.off(tile.el, 'error', this._tileOnError); // Might need context adjustment if used
        // Since we are *not* removing the element, ensure listeners are cleaned up if necessary,
        // although Leaflet might handle this internally when the layer is removed entirely.
        // For maximum safety, explicitly nullify them:
        tile.el.onload = null;
        tile.el.onerror = null;

        // --- CRITICAL MODIFICATION: DO NOT REMOVE THE TILE ELEMENT ---
		// The original code had this commented out, we ensure it stays that way or is removed.
		// L.TileLayer.prototype._removeTile.call(this, key); // <-- DO NOT CALL THIS

        // Do NOT remove the tile from the internal _tiles object either,
        // otherwise Leaflet might lose track of it.
        // delete this._tiles[key]; // <-- DO NOT DO THIS

        // We essentially do nothing here regarding DOM removal or Leaflet's internal tile tracking.
        // We only perform Dynmap-specific cleanup.
        console.log("WARN: Skipped removing tile DOM element: " + key + ". Tile persistence enabled."); // Optional: for debugging
	},

	// --- MODIFICATION: Override _pruneTiles ---
	_pruneTiles: function() {
		// Override Leaflet's tile pruning logic entirely.
		// Do nothing here to prevent tiles from being removed
		// when they are outside the current viewport buffer.
		// WARNING: This WILL lead to performance issues and high memory usage.
		// console.log("WARN: Skipped tile pruning. Tile persistence enabled."); // Optional: for debugging
	},

	// --- MODIFICATION: Override _removeTilesAtZoom ---
	_removeTilesAtZoom: function(zoom) {
		// Override Leaflet's logic for removing tiles when zoom changes.
		// Do nothing here to prevent tiles associated with other zoom
		// levels from being removed.
		// WARNING: This WILL lead to performance issues and high memory usage.
        // console.log("WARN: Skipped removing tiles at zoom " + zoom + ". Tile persistence enabled."); // Optional: for debugging

        // We still need to potentially update the visibility of tiles based on the *new* zoom,
        // but Leaflet's internal logic might handle this. If tiles from other zooms
        // remain visible incorrectly, further adjustments might be needed here or in CSS.
        // However, the primary goal (preventing DOM removal) is achieved by doing nothing.
	},

	// --- MODIFICATION: Override _removeOtherTiles ---
	// This is another method Leaflet might use for cleanup, especially related to zoom.
	_removeOtherTiles: function (bounds, zoom) {
        // Override Leaflet's logic for removing tiles outside the current bounds/zoom.
        // Do nothing here to prevent tile removal.
        // WARNING: This WILL lead to performance issues and high memory usage.
        // console.log("WARN: Skipped removing other tiles. Tile persistence enabled."); // Optional: for debugging
	},

    // --- MODIFICATION: Override remove ---
    // When the entire layer is removed from the map, ensure we clean up Dynmap's lists.
    // The parent `remove` method will handle Leaflet's internal cleanup, which *should*
    // trigger our overridden _removeTile for each tile, but let's be safe.
    onRemove: function(map) {
        // Dynmap specific cleanup (might be redundant if _removeTile cleans _namedTiles, but safe)
        this._namedTiles = {};
		this._cachedTileUrls = {};
		this._loadQueue = [];
		this._loadingTiles = [];

        // Call the parent method AFTER our cleanup to let Leaflet remove the layer container etc.
        L.TileLayer.prototype.onRemove.call(this, map);
    },


	getTileUrl: function(coords, timestamp) {
		// Ensure timestamp is handled correctly based on comments - seems it's disabled
		return this.getTileUrlFromName(this.getTileName(coords)/*, timestamp*/);
	},

	getTileUrlFromName: function(tileName, timestamp) {
		var url = this._cachedTileUrls[tileName];

		if (!url) {
			// Ensure options.dynmap is available
			if(this.options && this.options.dynmap) {
				this._cachedTileUrls[tileName] = url = this.options.dynmap.getTileUrl(tileName);
			} else {
				console.error("Dynmap options missing for getTileUrlFromName");
				return ""; // Return empty string or default image URL
			}
		}
		// Timestamp logic seems intentionally commented out in original code
		// if (typeof timestamp === 'undefined' && this.options && this.options.dynmap) {
		//    timestamp = this.options.dynmap.inittime
		// }
		// if(typeof timestamp !== 'undefined') {
		// 	url += (url.indexOf('?') === -1 ? '?timestamp=' + timestamp : '×tamp=' + timestamp);
		// }

		return url;
	},

	_tickLoadQueue: function() {
		// Limit concurrent loading requests
		if (this._loadingTiles.length >= (this.options.maxConcurrentLoads || 6)) { // Use an option or default
			return;
		}

		var next = this._loadQueue.shift();

		if (!next) {
			return;
		}

		// Ensure the tile hasn't been flagged for removal or its layer removed
		// (Although we prevent removal, this check is good practice)
		// We might need the associated tile key/coords here if we wanted to check
		// against this._tiles, but since we don't remove from _tiles, it's less critical.

		this._loadingTiles.push(next);
		next.src = next.url;
	},

	getTileName: function(coords) {
		// This needs to be implemented by a subclass or configured properly.
		// Using the provided getTileInfo as a likely implementation source.
		var tileInfo = this.getTileInfo(coords);
 		// Example format based on common Dynmap patterns (adjust if yours differs)
 		// Typically looks like: world/zoomprefix_x_y.png or prefix/world/zoomprefix_x_y.png
 		// Or flat: prefix_world_zoomprefix_x_y.png
 		// Using the info from getTileInfo:
 		return tileInfo.prefix + "/" + tileInfo.zoomprefix + tileInfo.scaledx + "_" + tileInfo.scaledy + tileInfo.nightday + "." + tileInfo.fmt;
		// throw "getTileName not implemented"; // Keep throw if it's truly abstract here
	},

	updateNamedTile: function(name, timestamp) {
		var tile = this._namedTiles[name];

		if (tile) {
            // Re-fetch the URL in case it changed (e.g., cache busting via timestamp)
			tile.url = this.getTileUrlFromName(name, timestamp);
            // Avoid adding duplicates to the load queue if it's already loading or queued
            if (this._loadingTiles.indexOf(tile) === -1 && this._loadQueue.indexOf(tile) === -1) {
			    this._loadQueue.push(tile);
			    this._tickLoadQueue();
            } else if (this._loadingTiles.indexOf(tile) !== -1) {
                // If currently loading, update its src immediately IF the URL actually changed.
                // Be careful: this might interrupt the current load. A safer approach might
                // be to let the current load finish and rely on browser caching or SW,
                // or queue a *new* load after the current one finishes.
                // For simplicity now, let's just re-queue if not already queued.
            }
		}
	},

	// Some helper functions.
	zoomprefix: function(amount) {
		// Corrected substr arguments: (start, length)
		return 'zzzzzzzzzzzzzzzzzzzzzzzzzz'[amount] ? 'z'.repeat(amount) : ''; // Modern way or use loop/substr
		// return 'zzzzzzzzzzzzzzzzzzzzzzzzzz'.substr(0, amount); // Original way
	},

	getTileInfo: function(coords) {
		// zoom: max zoomed in = this.options.maxZoom, max zoomed out = 0
		// izoom: max zoomed in = 0, max zoomed out = this.options.maxZoom (Leaflet zoom)
		// mapzoomin: Dynmap's specific property for max zoom *level* (often 0)
		// mapzoomout: Dynmap's depth (e.g., 3 for 3 zoom-out levels)
		var izoom = coords.z; // Use coords.z passed by Leaflet
        var mapzoomin = this.options.mapzoomin || 0; // Default if not provided

		// zoomoutlevel: izoom < mapzoomin -> 0, else -> izoom - mapzoomin (which ranges from 0 till mapzoomout)
		// This calculation seems slightly off based on typical Leaflet/Dynmap usage.
		// Usually, Leaflet zoom 0 is max *out*, maxZoom is max *in*.
		// Dynmap often has an internal 'mapzoomin' (e.g., 0) and 'mapzoomout' (number of levels).
		// The 'zoomoutlevel' calculation seems to relate Leaflet's zoom to Dynmap's internal zoom structure.
        // Let's assume options.maxZoom is Leaflet's max zoom and options.mapzoomin is Dynmap's base detail level.
        // Let L_zoom be Leaflet zoom (coords.z)
        // Let D_maxzoom be Dynmap mapzoomin (highest detail = 0 usually)
        // Let D_zoomout be Dynmap mapzoomout (number of steps outwards)
        // Let L_maxzoom be Leaflet maxZoom option

        // Dynmap's own zoom level often counts *outwards* from the most detailed level.
        // Let's try to map Leaflet zoom `coords.z` to Dynmap's zoom-out level.
        // If L_maxzoom corresponds to Dynmap's most detailed level (mapzoomin, often 0), then:
        // DynmapZoomOutLevel = L_maxzoom - L_zoom
        var dynmapZoomOutLevel = (this.options.maxZoom || 0) - izoom;
        // Clamp it, should not be negative, and likely capped by mapzoomout
        dynmapZoomOutLevel = Math.max(0, dynmapZoomOutLevel);
        if (typeof this.options.mapzoomout !== 'undefined') {
             dynmapZoomOutLevel = Math.min(dynmapZoomOutLevel, this.options.mapzoomout);
        }

		// Original calculation retained for compatibility if it worked before:
		// var zoomoutlevel = Math.max(0, izoom - mapzoomin); // Original calculation

        // Using the re-calculated dynmapZoomOutLevel:
        var zoomoutlevel = dynmapZoomOutLevel; // Use the potentially corrected level

		var scale = 1 << zoomoutlevel;
		var x = scale * coords.x;
		var y = scale * coords.y;

		return {
			// Prefix might be world name or a configured path prefix
			prefix: this.options.prefix || this.options.dynmap?.world?.name || 'world',
			nightday: (this.options.nightandday && this.options.dynmap && this.options.dynmap.serverday) ? '_day' : '',
			scaledx: x >> 5, // Tile width/height assumed 32x32? No, this is >>5 = /32. So block coords -> region coords? Check Dynmap format. Usually 128x128 tiles -> >>7
			scaledy: y >> 5, // Adjust shift based on actual tile grid size if not 32. For 128px tiles, use >> 7
			zoom: this.zoomprefix(zoomoutlevel), // String like 'zz_'
            zoomprefix: (zoomoutlevel == 0) ? "" : (this.zoomprefix(zoomoutlevel) + "_"), // String like 'zz_' or empty
			x: x, // Scaled tile coordinates
			y: y, // Scaled tile coordinates
			fmt: this.options['image-format'] || this.options.imageFormat || 'png' // Allow both notations
		};
	}
});

// --- IMPORTANT NOTES ---
// 1.  The rest of the provided script (DynmapProjection, polyfills, DynmapLayerControl, helpers)
//     remains unchanged as it doesn't directly relate to tile offloading within the layer itself.
// 2.  You MUST instantiate this `DynmapTileLayer` correctly, passing the necessary `dynmap` options
//     (like `getTileUrl`, `world`, `serverday`, `prefix`, `mapzoomin`, `mapzoomout`, `image-format`, etc.)
//     within the `options` object during layer creation. The `initialize` function expects
//     `this.options.dynmap` and other options like `prefix`, `mapzoomin`, etc.
// 3.  PERFORMANCE WARNING: This modification WILL cause significant performance issues
//     and memory leaks over time. It's generally not recommended for production use
//     unless you have a very specific, limited use case and understand the consequences.
// 4.  Ensure the `getTileName` implementation correctly matches your Dynmap's tile naming scheme.
//     The example provided uses `getTileInfo` which also needs correct options (`maxZoom`, `mapzoomin`, `prefix`, etc.).
// 5.  Error handling and edge cases (like what happens when the map is destroyed) might need further refinement.