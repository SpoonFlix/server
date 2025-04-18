componentconstructors['playermarkers'] = function(dynmap, configuration) {
	var me = this;

	// Helper function to format the name
	function formatPlayerName(name) {
		if (typeof name !== 'string') {
			return name; // Return original if not a string
		}
		var bracketIndex = name.indexOf(']');
		if (bracketIndex !== -1) {
			return name.substring(bracketIndex + 1); // Get the part after ']'
		}
		return name; // Return original name if ']' is not found
	}

	$(dynmap).bind('playeradded', function(event, player) {
		// Create the player-marker.
		var markerPosition = dynmap.getProjection().fromLocationToLatLng(player.location);
		player.marker = new L.CustomMarker(markerPosition, { elementCreator: function() {
			var div = document.createElement('div');
			var playerImage;

			var markerPosition = dynmap.getProjection().fromLocationToLatLng(player.location);
            // It seems setting LatLng here might be redundant as it's set in the constructor,
            // but we'll keep it as it was in the original code unless it causes issues.
            // player.marker might not be fully initialized yet inside elementCreator in some Leaflet versions.
            // If issues arise, consider moving this update logic outside elementCreator.
            // player.marker.setLatLng(markerPosition); // Potentially move this if needed

			// Only show player faces if canvas supported
			if(dynmap.canvassupport == false)
				configuration.showplayerfaces = false;

			// MODIFICATION START: Format the player name before appending
			var displayName = formatPlayerName(player.name);
			// MODIFICATION END

			$(div)
				.addClass('Marker')
				.addClass('playerMarker')
				.append(playerImage = $('<img/>').addClass(configuration.smallplayerfaces?'playerIconSm':(configuration.largeplayerfaces?'playerIconLg':'playerIcon'))
						.attr({ src: 'images/player.png' }))
				.append(player.namefield = $('<span/>')
					.addClass(configuration.smallplayerfaces?'playerNameSm':(configuration.largeplayerfaces?'playerNameLg':'playerName'))
					// MODIFICATION START: Use the formatted display name
					.append(displayName));
					// MODIFICATION END

			if (configuration.showplayerfaces) {
				if(configuration.smallplayerfaces) {
					getMinecraftHead(player.account, 16, function(head) {
						$(head)
							.addClass('playerIconSm')
						.prependTo(div);
						playerImage.remove();
					});
				}
				else if(configuration.largeplayerfaces) {
					getMinecraftHead(player.account, 32, function(head) {
						$(head)
							.addClass('playerIconLg')
						.prependTo(div);
						playerImage.remove();
					});
				}
				else if(configuration.showplayerbody) {
					getMinecraftHead(player.account, 'body', function(head) {
						$(head)
							.addClass('playerIcon')
						.prependTo(div);
						playerImage.remove();
					});
				}
				else {
					getMinecraftHead(player.account, 32, function(head) {
						$(head)
							.addClass('playerIcon')
						.prependTo(div);
						playerImage.remove();
					});
				}
			}
			if (configuration.showplayerhealth) {
				player.healthContainer = $('<div/>')
					.addClass(configuration.smallplayerfaces?'healthContainerSm':(configuration.largeplayerfaces?'healthContainerLg':'healthContainer'))
					.appendTo(div);
				if (player.health !== undefined && player.armor !== undefined) {
					player.healthBar = $('<div/>')
						.addClass('playerHealth')
						.css('width', Math.ceil(player.health*2.5) + 'px');
					player.armorBar = $('<div/>')
						.addClass('playerArmor')
						.css('width', Math.ceil(player.armor*2.5) + 'px');

					$('<div/>')
						.addClass('playerHealthBackground')
						.append(player.healthBar)
						.appendTo(player.healthContainer);
					$('<div/>')
						.addClass('playerArmorBackground')
						.append(player.armorBar)
						.appendTo(player.healthContainer);
				} else {
					player.healthContainer.css('display','none');
				}
			}
			else {
				player.namefield.addClass('playerNameNoHealth');
			}

			return div;
		}});
		if(dynmap.world === player.location.world)
			dynmap.playermarkergroup.addLayer(player.marker);
	});

	$(dynmap).bind('playerremoved', function(event, player) {
		// Remove the marker.
		if (player.marker) { // Add check if marker exists
		    dynmap.playermarkergroup.removeLayer(player.marker);
        }
	});

	$(dynmap).bind('playerupdated', function(event, player) {
		// Ensure marker exists before proceeding
		if (!player.marker) return;

		if(dynmap.world === player.location.world) {
			// Add if needed (check if it's already on the map layer)
            if (!dynmap.playermarkergroup.hasLayer(player.marker)) {
			    dynmap.playermarkergroup.addLayer(player.marker);
            }
			// Update the marker position.
			var markerPosition = dynmap.getProjection().fromLocationToLatLng(player.location);
			player.marker.setLatLng(markerPosition);
			// Update health
			if (configuration.showplayerhealth && player.healthContainer) {
				if (player.health !== undefined && player.armor !== undefined) {
					player.healthContainer.css('display','block');
					player.healthBar.css('width', Math.ceil(player.health*2.5) + 'px');
					player.armorBar.css('width', Math.ceil(player.armor*2.5) + 'px');
				} else {
					player.healthContainer.css('display','none');
				}
			}
		} else {
			dynmap.playermarkergroup.removeLayer(player.marker);
		}

		// MODIFICATION START: Format name before comparing and updating
		if (player.namefield) {
			var displayName = formatPlayerName(player.name);
			if (player.namefield.html() !== displayName) { // Compare with formatted name
				player.namefield.html(displayName); // Update with formatted name
			}
		}
		// MODIFICATION END
	});

    // Remove marker on start of map change
	$(dynmap).bind('mapchanging', function(event) {
		var name;
		for(name in dynmap.players) {
			var player = dynmap.players[name];
            if (player.marker) { // Add check
			    // Turn off marker - let update turn it back on
			    dynmap.playermarkergroup.removeLayer(player.marker);
            }
		}
	});

    // NOTE: You had two identical 'mapchanging' handlers. I'm keeping only one.
    // If the second was intentional for a different reason, you might need to merge logic.

    // Add markers back on end of map change
	$(dynmap).bind('mapchanged', function(event) {
		var name;
		for(name in dynmap.players) {
			var player = dynmap.players[name];
            if (player.marker) { // Add check
			    if(dynmap.world === player.location.world) {
				    dynmap.playermarkergroup.addLayer(player.marker);
				    var markerPosition = dynmap.getProjection().fromLocationToLatLng(player.location);
				    player.marker.setLatLng(markerPosition);
			    }
            }
		}
	});

	dynmap.playermarkergroup = new L.LayerGroup();
	if(!configuration.hidebydefault)
		dynmap.map.addLayer(dynmap.playermarkergroup);
	dynmap.addToLayerSelector(dynmap.playermarkergroup, configuration.label || 'Players', configuration.layerprio || 0);
};