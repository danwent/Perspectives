var Pers_results = {
	root_prefs : Components.classes["@mozilla.org/preferences-service;1"].
				getService(Components.interfaces.nsIPrefBranch),


	switchResultForm: function(){
		var sel = document.getElementById("info-radio").selectedIndex;
		document.getElementById("perspective-svg-box").hidden     = sel;
		document.getElementById("perspective-description").hidden = !sel;
	},

	addTimeline: function(svgString){
		parser       = new DOMParser();
		var svgDoc   = parser.parseFromString(svgString, "text/xml");
		var svg = svgDoc.getElementsByTagName("svg")[0];
		var after    = document.getElementById("perspective-svg-box");
		after.appendChild(svg);
	},

	// returns a string that describes whether perspectives installed a 
	// security exception 
	getActionStr: function(uri,ti) {
		if(uri.scheme != "https") {  
			return "Perspectives only queries 'https' sites. This site uses '" + uri.scheme + "'"; 
		} else if(ti.is_override_cert && ti.already_trusted) { 
			return  "Perspectives has previously installed a security exception for this site."; 
		} else if(ti.already_trusted) { 
			return "The browser trusts this site and requires no security exception";  
		} else if(ti.is_override_cert && ti.notary_valid && ti.exceptions_enabled && ti.isTemp) { 
			return  "Perspectives installed a temporary security exception for this site."; 
		} else if(ti.is_override_cert && ti.notary_valid && ti.exceptions_enabled && !ti.isTemp){ 
			return "Perspectives installed a permanent security exception for this site."; 
		} else { 
			return "No security exception has been installed"; 
		} 
	},

	load_results_dialog: function(){

		try {
			var info  = document.getElementById("perspective-description");
			var liner = document.getElementById("perspective-quorum-duration");
			var host  = document.getElementById("perspective-information-caption");
			if(!window.opener.gBrowser) { 
				Pers_debug.d_print("error",
					"window.opener.browser is null in results dialog"); 
				return; 
			} 
			var browser = window.opener.gBrowser; 
			var uri = window.opener.gBrowser.currentURI; 
			if(!uri) { 
				Pers_debug.d_print("error","null URI in results dialog"); 
				return; 
			} 
			try { 
				var ignore = uri.host; 
			} catch(e) { 
				return;
			}
			var ti = window.opener.Perspectives.tab_info_cache[browser]; 
			var cert  = ti.query_results; 
			host.label = uri.host;
			if(ti) { 
				host.label += ": " + Pers_results.getActionStr(uri, ti); 
			} 
			if(cert){
				info.value  = cert.summary;
				liner.value = cert.tooltip;
				if(cert.svg && cert.svg != ""){
					info.hidden = true;
					Pers_results.addTimeline(cert.svg);
					var radio = document.getElementById("info-radio");
					radio.hidden=false;
					radio.selectedIndex = 0;
				}
			} else if (ti.reason_str) {
				info.value = ti.reason_str; 
			} 
			 
		} catch(e) { 
			Pers_debug.d_print("error", "Error loading results dialog"); 
			Pers_debug.d_print("error", e); 
			alert("Error loading Perspectives dialog: " + e); 
		}  
  
		return true;
	}
}
