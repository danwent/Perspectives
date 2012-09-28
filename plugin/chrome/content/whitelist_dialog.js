/*
*   This file is part of the Perspectives Firefox Client
*
*   Copyright (C) 2011 Dan Wendlandt
*
*   This program is free software: you can redistribute it and/or modify
*   it under the terms of the GNU General Public License as published by
*   the Free Software Foundation, version 3 of the License.
*
*   This program is distributed in the hope that it will be useful,
*   but WITHOUT ANY WARRANTY; without even the implied warranty of
*   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
*   GNU General Public License for more details.
*
*   You should have received a copy of the GNU General Public License
*   along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/


var Pers_whitelist_dialog = {
	root_prefs : Components.classes["@mozilla.org/preferences-service;1"].
				getService(Components.interfaces.nsIPrefBranch),

	add_to_whitelist : function() { 	
		try {
			// use Perspectives.strbundle because whitelist_dialog.xul isn't loaded yet
			if(Perspectives.strbundle == null) {
					Perspectives.strbundle = document.getElementById("notary_strings");
			}
			var error_text = Perspectives.detectInvalidURI(window);
			if(error_text) {
				Pers_util.pers_alert(Perspectives.strbundle.getString("couldNotAddToWhitelist")
					+ ": " + error_text);
				return;
			}
			var host = window.gBrowser.currentURI.host;
			window.openDialog("chrome://perspectives/content/whitelist_dialog.xul", "", "centerscreen", host).focus();
		} catch (e) { Pers_util.pers_alert("add_to_whitelist: " + e); }

	},

	confirm_add : function() {
		try {  
		var host = window.arguments[0];
		var is_domain = document.getElementById("whitelist-radio-2").selected; 
		var is_ip = this.is_ip_address(host); 
	
		window.close(); 
	
		if(is_domain) { 
			if(is_ip) { 
				var regex = this.get_ip_domain_regex(host); 
			} else { 
				var regex = this.get_dns_domain_regex(host); 
			} 	
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
		window.opener.Perspectives.forceStatusUpdate(window.opener); 
		} catch(e) { Pers_util.pers_alert("confirm_add: " + e); }
	}, 

	is_ip_address: function(host) { 
		var host_arr = host.split("\.");   
		return host_arr[host_arr.length - 1].match(RegExp("[0-9]+")); 
	}, 

	// 'host' could be a domain name or an ip address
	get_dns_domain_text: function(host) { 
		var host_arr = host.split("\.");   
		var l = host_arr.length;
		if(host_arr.length > 1) {
			return  host_arr[l - 2] + "." + host_arr[l - 1]; 
		}
		return null; 
	},

	get_dns_domain_regex: function(host) {
		return ".*\\." + this.get_dns_domain_text(host).replace(".","\\.","g") + "$"; 
	},  
	
	get_ip_domain_text: function(host) { 
		var host_arr = host.split("\.");   
		var l = host_arr.length;
		var prefix =  host_arr[0] + "." + host_arr[1] + "." + host_arr[2] + ".";  
		if(host_arr.length == 4) {
			return prefix + "0" + " - " + prefix + "255"; 
		}
		return null; 
	}, 

	get_ip_domain_regex: function(host) { 
		var host_arr = host.split("\.");   
		var l = host_arr.length;
		var prefix =  host_arr[0] + "." + host_arr[1] + "." + host_arr[2] + ".";  
		return "^" + prefix.replace(".","\\.","g") + "[0-9]+$"; 
	}, 

	fill_dialog: function(){
		try {
			if(Pers_whitelist_dialog.strbundle == null) {
					Pers_whitelist_dialog.strbundle = document.getElementById("whitelist_strings");
				}

			var host = window.arguments[0];
			document.getElementById("whitelist-radio-1").label =
				Pers_whitelist_dialog.strbundle.getString("whitelistWebsite") + " '" + host + "'";
				
			document.getElementById("whitelist-radio-2").hidden = true; 
			if(this.is_ip_address(host)) { 
				var host_text = this.get_ip_domain_text(host); 
				if(host_text) { 
					document.getElementById("whitelist-radio-2").label =
						Pers_whitelist_dialog.strbundle.getString("whitelistAllWebsitesInIP") + " '" + host_text + "'";
					document.getElementById("whitelist-radio-2").hidden = false; 
				} 
			} else {  
				var dns_text = this.get_dns_domain_text(host); 
				if(dns_text) { 
					document.getElementById("whitelist-radio-2").label =
						Pers_whitelist_dialog.strbundle.getString("whitelistAllWebsitesInDomain") + " '" + dns_text + "'";
					document.getElementById("whitelist-radio-2").hidden = false; 
				} 
			}	

		} catch(e) { Pers_util.pers_alert("fill_dialog: " + e); }
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
				var display_str = e.replace(/\\/g,"").replace("$","").replace("^",""); 
				if (host.match(r)) {
					var answer = confirm("Remove '" + display_str + "' from whitelist?"); //FIXME: localize, once we know how to get here
					if(answer) { 
						continue; 
					} 
				} 
				new_whitelist.push(e); 
			} 
			Perspectives.root_prefs.setCharPref("perspectives.whitelist",new_whitelist.join(",")); 
			window.Perspectives.forceStatusUpdate(window);  
		} catch(e) { alert("remove_from_whitelist:" + e); } 
	} 
		
}


