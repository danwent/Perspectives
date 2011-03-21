
//String.prototype.trim = function() { return this.replace(/^\s+|\s+$/, ''); };
var Pers_debug = {
	d_print_all : true,

	d_print_flags : { 
		"policy" : false, 
		"query" : false,
		"main" : false,  
		"error" :  false 
	},

	d_print: function(flag,line) {
		if(!Pers_debug.d_print_flags[flag] && !Pers_debug.d_print_all) { 
			return; 
		} 
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
		for(var i = 0; i < start_arr.length; i++) { 
        		if (start_arr[i].length > 0 && start_arr[i][0] != "#")
        			filtered_arr.push(start_arr[i]); 
		} 
       		var i = 0;
		var notary_list = [];  
        	while (i < filtered_arr.length) {  
			var host = filtered_arr[i]; 
            		var notary_server = { "host" : host }; 
            		i += 1;

            		if (i >= filtered_arr.length || filtered_arr[i].indexOf("BEGIN PUBLIC KEY") === -1) { 
                		throw("Error parsing notary entry for '" + host + "'" + 
					". Could not fine 'BEGIN PUBLIC KEY' line."); 
            		}
            		i += 1;

            		var key = ""; 
            		while (i < filtered_arr.length && filtered_arr[i].indexOf("END PUBLIC KEY") === -1) { 
                		key += filtered_arr[i]; 
                		i += 1;
				if(i == filtered_arr.length) { 
					throw("Error parsing notary entry for '" + host + "'" + 
						". No 'END PUBLIC KEY' line found."); 
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
	}
 
}
