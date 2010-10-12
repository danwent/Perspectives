var Pers_whitelist_dialog = {
	root_prefs : Components.classes["@mozilla.org/preferences-service;1"].
				getService(Components.interfaces.nsIPrefBranch),

	add_to_whitelist : function() { 	
		try {
			var host = window.gBrowser.currentURI.host;
        		window.openDialog("chrome://perspectives/content/whitelist_dialog.xul", "", "", host).focus();
		} catch (e) { alert("add_to_whitelist: " + e); } 

	},

	confirm_add : function() {
		try {  
		var host = window.arguments[0];
		var is_domain = document.getElementById("whitelist-radio-2").selected; 
	
		window.close(); 
	
		if(is_domain) { 	
			var regex = ".*\\." + this.get_domain(host).replace(".","\\.","g") + "$"; 
		} else { 
			var regex = "^" + host.replace(".","\\.","g") + "$"; 
		}  
		var whitelist = this.root_prefs.getCharPref("perspectives.whitelist");
		if(whitelist.length == 0) { 
			whitelist = regex; 
		} else { 
			whitelist = whitelist + "," + regex; 
		} 	
		this.root_prefs.setCharPref("perspectives.whitelist",whitelist); 
		window.opener.Perspectives.forceStatusUpdate(window.opener.gBrowser); 
		} catch(e) { alert("confirm_add: " + e); } 
	}, 

	get_domain: function(host) { 
		var host_arr = host.split("\.");   
		if(host_arr.length < 3) {
			return null; 
		}  
		var l = host_arr.length;
		return  host_arr[l - 2] + "." + host_arr[l - 1]; 
	}, 

	fill_dialog: function(){
		try {
			var host = window.arguments[0];
			document.getElementById("whitelist-radio-1").label = "Whitelist website '" + host + "'"; 
			var domain = this.get_domain(host); 
			if(domain) {  
				document.getElementById("whitelist-radio-2").label = "Whitelist all websites in the domain '" + domain + "'"; 
			} else { 
				document.getElementById("whitelist-radio-2").hidden = true; 
			} 

		} catch(e) { alert("fill_dialog: " + e); } 
	}, 

	remove_from_whitelist : function() { 
		try { 
			var host = window.gBrowser.currentURI.host;
			var old_whitelist = Perspectives.root_prefs.getCharPref("perspectives.whitelist").split(",");
			var new_whitelist = []; 
			for(var entry in old_whitelist) {
				var e = old_whitelist[entry]; 
				if(e.length == 0) { 
					continue; 
				} 
				var r = RegExp(e);
				if (host.match(r)) {
					var answer = confirm("Remove '" + e + "' from whitelist?");  
					if(answer) { 
						continue; 
					} 
				} 
				new_whitelist.push(e); 
			} 
			Perspectives.root_prefs.setCharPref("perspectives.whitelist",new_whitelist.join(",")); 
			window.Perspectives.forceStatusUpdate(window.gBrowser);  
		} catch(e) { alert("remove_from_whitelist"); } 
	} 
		
}


