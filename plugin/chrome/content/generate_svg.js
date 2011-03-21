var Pers_gen = {
	colors : [ "blue","purple","yellow","orange","cyan", "red", 
			"brown" ],

	num_sort_desc: function(a,b) { 
		return b - a; 
	}, 

 
	setup_color_info: function(server_result_list,cutoff,color_info) { 
		var key_to_ts_list = {}; 
		for(var i = 0; i < server_result_list.length; i++) { 
			var results = server_result_list[i]; 
			for(var j = 0; j < results.obs.length; j++) { 
				var obs = results.obs[j];
				if (key_to_ts_list[obs.key] == null)  
					key_to_ts_list[obs.key] = []; 
				for(k = 0; k < obs.timestamps.length; k++) { 
					var ts = obs.timestamps[k].end; 
					key_to_ts_list[obs.key].push(ts); 
				} 
			}
		}
		var most_recent_list = []; 
		for(key in key_to_ts_list) { 
			key_to_ts_list[key].sort(Pers_gen.num_sort_desc);
			var most_recent_ts = key_to_ts_list[key][0]; 
			if(most_recent_ts >= cutoff) { 
				most_recent_list.push({ "key" : key, 
					"ts" : most_recent_ts });
			} 
		}
		var most_recent_ts = function (a, b) { 
			return b.ts - a.ts; 
		}  
		most_recent_list.sort(most_recent_ts);
		Pers_debug.d_print("main","most_recent_list");
		Pers_debug.d_print("main", most_recent_list);
		var color_count = 0;
		for(var i = 0; i < most_recent_list.length && 
			 i < Pers_gen.colors.length; i++) { 
			color_count++; 
			color_info[most_recent_list[i].key] = Pers_gen.colors[i]; 
		}  	
		return color_count;    
	}, 
 

	get_svg_graph: function(service_id, server_result_list, len_days,cur_secs, 
							browser_key, max_stale_sec) {
		var x_offset = 230, y_offset = 40; 
		var width = 700;
		var y_cord = y_offset; 
		var pixels_per_day = (width - x_offset - 20) / len_days; 
		var rec_height = 10; 
		var grey_used = false; 
		var cutoff = cur_secs - Pers_util.DAY2SEC(len_days);
		var color_info = {};  
		var color_count = Pers_gen.setup_color_info(server_result_list, 
							cutoff,color_info);
		var height = color_count * 30 + server_result_list.length * 20 
			 	+ y_offset + 60;
		var stale_cutoff = cur_secs - max_stale_sec; 

		color_info[browser_key] = "green"; 	
		var tmp_x = x_offset + 70;  
		var res =  '<?xml version="1.0"?>\n' 
					+ '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" '
					+   '"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n'
					+  	'<svg xmlns="http://www.w3.org/2000/svg" version="1.1"' 
					+    ' width="' + width + '" height="' + height + '">\n'
					+    '<rect x="0" y="0" width="' + width + '" ' 
					+ 	'height="' + height + '" fill="white" />'
					+    '<text x="' + (x_offset + 70)  
					+	'" y="' +  y_cord + '" font-size="15" >'
					+    'Key History (Days) </text>\n'   
					+    '<text x="4" y="' + y_cord 
					+ 	'" font-size="15">Notary and Current Key</text>\n';
   
		y_cord += 20;
		for(var i = 0; i < server_result_list.length; i++) {
			var most_recent_color = "white"; // none
			var most_recent_end = 0;  
			var results = server_result_list[i]; 
			y_cord += 20; 
			res += '<text x="4" y="' + (y_cord + 8) + '" font-size="10">' 
				+ results.server + '</text>\n'; 
 
			for(var j = 0; j < results.obs.length; j++) { 
				var obs = results.obs[j];
				var color = color_info[obs.key]; 
				if(color == null)
					color = "grey"; // default color 

				for(k = 0; k < obs.timestamps.length; k++) { 
					var t_start = obs.timestamps[k].start;
					var t_end = obs.timestamps[k].end;
					if(t_end < cutoff)
						continue;
					if(t_start < cutoff)
						t_start = cutoff; // draw partial 
					if(t_end > most_recent_end) { 
						most_recent_end = t_end;
						most_recent_color = color; 
					} 
					if(color == "grey") 
						grey_used = true; 
					var time_since = cur_secs - t_end; 
					var duration = t_end - t_start; 
					var x_cord = x_offset + 
					parseInt(pixels_per_day * Pers_util.SEC2DAY(time_since)); 
					var span_width = pixels_per_day * 
						Pers_util.SEC2DAY(duration); 
					// a timespan with no width is not shown        
					if(span_width > 0) {          
						res += '<rect x="' + x_cord 
							+ '" y="' + y_cord + '"'
							+  ' width="' + span_width + '"'
							+  ' height="' + rec_height + '"'
							+  ' fill="' + color + '" rx="1"' 
							+  ' stroke="black" stroke-width="1px" />\n'; 
					}
				} // end per-timespan
 
			} // end per-key  

			// if the most recent key is stale and thus
			// will be ignored by the client, don't show
			// it as the "current key"
	    		if(most_recent_end < stale_cutoff) { 
				most_recent_color = "white"; 
			} 

			// print "current key" circle      
			res += '<rect x="' + (x_offset - 30) + '" y="' + y_cord 
				+ '" width="10" height="10" fill="' + most_recent_color 
				+ '" rx="5" stroke="black" stroke-width="1px" />\n';
		} // end per-server 
  	
		// draw Days axis  
		for(var i = 0; i < 11; i++) {    
			var days = i * (len_days / 10.0);
			var x = x_offset + (pixels_per_day * days);
			var y = y_offset + 30;    
			if(len_days < 10 && days != 0)  {  
				// print with decimal point (broken)
				res += '<text x="' + x + '" y="' + y 
					+ '" font-size="15">' 
					+ days + '</text>\n'; 
          	} else {      
				res += '<text x="' + x + '" y="' + y 
					+ '" font-size="15">' 
					+ days + '</text>\n'; 
			}    
			res += '<path d = "M ' + x + ' ' + y +  ' L ' + x 
				+ ' ' + (y_cord + 20) 
				+ '" stroke = "grey" stroke-width = "1"/>\n'; 
		} 
	
		// draw legend mapping colors to keys
		y_cord += 30;
		if(grey_used) 
			color_info["all other keys"] = "grey"; 
		for (key in color_info) {
			var match_text = (key == browser_key) ? " (browser's key)" : "";  
			res += '<rect x="' + x_offset + '" y="' + y_cord 
				+ '" width="10" height="10" fill="'
				+ color_info[key] 
				+ '" rx="0" stroke="black" stroke-width="1px" />\n'
				+ '<text x="' + (x_offset + 15) 
				+ '" y="' + (y_cord + 9) + '" font-size="13">'
				+  key + match_text + '</text>\n'; 
				y_cord += 20;
		}
 
		res += '</svg>'; 
		return res; 
	} 
}
