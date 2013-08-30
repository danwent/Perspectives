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


var Pers_debug = {
	d_print_all : false,

	d_print_flags : { 
		"policy" : false, 
		"query" : false,
		"querylarge": false, //big response strings and XML; separating this from query lines makes for easier debugging
		"main" : false,  
		"error" :  false 
	},

	d_print: function(flag,line) {
		if(!Pers_debug.d_print_flags[flag] && !Pers_debug.d_print_all) { 
			return; 
		} 
		line = "Perspectives: " + line;
		dump(line); 
		try { 
			Firebug.Console.log(line); // this line works in extensions
		} catch(e) { 
			/* ignore, this will blow up if Firebug is not installed */  
		}
		try { 
			console.log(line); // this line works in HTML files
		} catch(e) { 
			/* ignore, this will blow up if Firebug is not installed */  
		}
	}
}

var Pers_util = {
	get_unix_time: function() { 
		var unixtime_ms = (new Date()).getTime(); // Returns milliseconds since the epoch
		return parseInt(unixtime_ms / 1000);
	},

	SEC2DAY: function(sec) { return sec / (3600 * 24); },
	DAY2SEC: function(day) { return day * (3600 * 24); }, 

	// stolen from: http://forums.mozillazine.org/viewtopic.php?p=921150
	readFileFromURI: function(uri){

  		var ioService=Components.classes["@mozilla.org/network/io-service;1"]
				.getService(Components.interfaces.nsIIOService);
  		var scriptableStream=Components.classes["@mozilla.org/scriptableinputstream;1"]
    				.getService(Components.interfaces.nsIScriptableInputStream);
  		var channel=ioService.newChannel(uri,null,null);
  		var input=channel.open();
  		scriptableStream.init(input);
  		var str=scriptableStream.read(input.available());
  		scriptableStream.close();
  		input.close();
  		return str;
	},

	loadNotaryListFromURI: function(uri) { 
		return this.loadNotaryListFromString(this.readFileFromURI(uri));
	}, 
 
	loadNotaryListFromString: function(str_data) { 
		var start_arr = str_data.split("\n"); 
		var filtered_arr = []; 
		// the Perspectives object isn't always loaded here, so use our own
		// to make sure it exists.
		if(Pers_util.notarystr == null) {
			Pers_util.notarystr = document.getElementById("notary_strings");
		}

		for(var i = 0; i < start_arr.length; i++) { 
        		if (start_arr[i].length > 0 && start_arr[i][0] != "#") {
        			// ignore lines that contain only whitespace -
        			// makes the file easier to parse cross-platform
        			if (/^\s+$/g.test(start_arr[i]) === false) {
        				filtered_arr.push(start_arr[i]);
        			}
        		}
		} 
       		var i = 0;
		var notary_list = [];  
        	while (i < filtered_arr.length) {  
			var host = filtered_arr[i]; 
            		var notary_server = { "host" : host }; 
            		i += 1;

            		var begin_string = "BEGIN PUBLIC KEY";
            		if (i >= filtered_arr.length || filtered_arr[i].indexOf(begin_string) === -1) {
            			throw(Pers_util.notarystr.getFormattedString("errorParsingNotaryEntry", [ host ]) +
            				' - ' + Pers_util.notarystr.getFormattedString("couldNotFindLine", [ begin_string ]));
            		}
            		i += 1;

            		var key = ""; 
            		var end_string = "END PUBLIC KEY";
            		while (i < filtered_arr.length && filtered_arr[i].indexOf(end_string) === -1) {
                		key += filtered_arr[i]; 
                		i += 1;
				if(i == filtered_arr.length) { 
					throw(Pers_util.notarystr.getFormattedString("errorParsingNotaryEntry", [ host ]) +
						' - ' +  Pers_util.notarystr.getFormattedString("couldNotFindLine", [ end_string ]));
				}
            		}

            		i += 1; // consume the 'END PUBLIC KEY' line
            		notary_server.public_key = key; 
            		notary_list.push(notary_server);  
        	} 
		return notary_list; 
	},  

	// stolen from: http://stackoverflow.com/questions/130404/javascript-data-formatting-pretty-printer
	pretty_print_json : function(obj, indent) {
 
		function IsArray(array) { return !( !array || (!array.length || array.length == 0) || typeof array !== 'object' || !array.constructor || array.nodeType || array.item ); } 

  		var result = "";
  		if (indent == null) indent = "";

  		for (var property in obj){
    			var value = obj[property];
			var txt = "<unknown type>"; 
			var t = typeof value; 
    			if (t == 'string' || t == 'boolean' || t == 'number')
      				txt = "'" + value + "'";
    			else if (t == 'object'){
      			/*	if (IsArray(value)){
        				txt = "[ \n";
					//alert("array " + property + " has length " + obj[property].length);  
					for(i = 0; i < obj[property].length; i++) { 
					     //txt = txt + this.pretty_print_json(obj[property][i],indent) + ",\n"; 
					     txt = txt + obj[property][i] + ",\n"; 
					} 
					txt = txt + "]\n"; 
      				} else */ if(true) {
        				// Recursive dump
        				// (replace "  " by "\t" or something else if you prefer)
        				var od = this.pretty_print_json(value, indent + "  ");
        				// If you like { on the same line as the key
        				//value = "{\n" + od + "\n" + indent + "}";
        				// If you prefer { and } to be aligned
        				txt = "\n" + indent + "{\n" + od + "\n" + indent + "}";
      				}
    			}
    			result += indent + "'" + property + "' : " + txt + ",\n";
  		}
  		return result.replace(/,\n$/, "");
	}, 
	
	// Mozilla's verification API assumes a DER header describing the 
	// signature's cryptographic parameters.  The openssl-generated signatures 
	// returned by the notary server do not have this.  Since the header is the
	// same for all notary responses, we just statically prepend the data 
	// here, and re-encode the signature in base64.  
	// see firefox-v2/xp_src/moz_crypto.cpp for details of header format
	add_der_signature_header: function(sig_base64) { 

		var base_str = Pers_Base64.decode(sig_base64); 
		var der_header_md5 = [ "0x30", "0x81", "0xbf", "0x30", "0x0d", "0x06", 
							"0x09", "0x2a", "0x86", "0x48", "0x86", "0xf7", 
							"0x0d", "0x01", "0x01", "0x04", "0x05", "0x00", 
							"0x03", "0x81", "0xad", "0x00"];
		var header_str = '';
		for (i = 0; i < der_header_md5.length; i++) { 
			header_str += String.fromCharCode(parseInt(der_header_md5[i],16));
		}
		return Pers_Base64.encode(header_str + base_str) ; 
	}, 

	
	update_public_key : "MIHKMA0GCSqGSIb3DQEBAQUAA4G4ADCBtAKBrAF16BJZAsESZnEq6MeCYsntL1233FVdz/6dNXptTwoKACOcnoae+/S5d9Ms2kmQMTMWkW5NdRV2/iKIdQx14Y7GZojPYvL85ZjwlTXRblqwoxnwdE+Vd2V5itxV0Okcu2+E66tvtr6aeBVt7hwtowyQPgiWz2rDgV6RsohbetiaHUMZKDdoQFzu/5CAW+7QtbFoJjNMqez6pz80xFWrIJzRC+fXlues1Af37+cCAwEAAQ==", 
	update_list_uri : "http://update.networknotary.org/http_notary_list.txt", 
	update_sig_uri : "http://update.networknotary.org/http_notary_list.sig", 
	update_default_notary_list_from_web: function(root_prefs) {
		try { 
		 
			var notary_list_data = Pers_util.readFileFromURI(this.update_list_uri); 
			var sig_no_header = Pers_util.readFileFromURI(this.update_sig_uri); 
			var sig = this.add_der_signature_header(sig_no_header); 
			var verifier = Components.classes["@mozilla.org/security/datasignatureverifier;1"].
							createInstance(Components.interfaces.nsIDataSignatureVerifier);
			var result = verifier.verifyData(notary_list_data, sig, this.update_public_key);  
			if(!result) { 
        			Pers_debug.d_print("error", "Signature verification failed on notary list update");
				return; 	
			}
			root_prefs.setCharPref("perspectives.default_notary_list",notary_list_data);
		} catch(e) { 
			//Note: localize this message if we ever expose this preference
			alert("Unexpected error updating default notary_list from web: " + e); 
		} 

	}, 

	update_default_notary_list_from_file : function(root_prefs) { 
		try { 
			var notary_list_data = this.readFileFromURI("chrome://perspectives/content/http_notary_list.txt");  
			root_prefs.setCharPref("perspectives.default_notary_list",notary_list_data);
		} catch(e) { 
			//Note: localize this message if we ever expose this preference
			alert("Unexpected error updating default notary_list from web: " + e); 
		} 
	},

	// Wrap all calls to alert() so we show a common title.
	// This way the user knows the messages are from Perspectives,
	// which reduces confusion and makes it more likely that a bug will
	// actually be reported (since they can now figure out where the bug came from).
	//
	// Note: most strings passed here should still be localized strings
	// taken from dialogs.dtd or notaries.properties files, not hard-coded.
	// FIXME - existing alerts should be changed to use this. Make sure to test them!
	pers_alert: function(msg) {
	       alert("Perspectives: " + msg);
	// TODO we could include contact info here too
	},

	// Make opening a link nicer by opening in a new tab if possible
	open_url: function(url) {
		try {
		    var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
				   .getService(Components.interfaces.nsIWindowMediator);
		    var wnd = wm.getMostRecentWindow("navigator:browser");

		    if(wnd && !wnd.closed && wnd.gBrowser) {
			    wnd.gBrowser.selectedTab = wnd.gBrowser.addTab(url);
		    }
		    else {
			    // if new tabs aren't possible just launch a new window
			    wnd = window.open(url);
		    }
		    wnd.focus();
		}
		catch (e) {
		    this.pers_alert("error opening link: " + e);
		}
	}
}

var Pers_keypress = {

    ESC_KEYCODE: 27,

    press_esc_to_close: function(event) {

        var key = (event.keyCode ? event.keyCode : event.which);
        if (key) {

            // let the Esc key close the window
            if (key == Pers_keypress.ESC_KEYCODE) {
                window.close();
            }
        }
        return true;
    }
}
