
//String.prototype.trim = function() { return this.replace(/^\s+|\s+$/, ''); };
var Pers_debug = {
	d_print_all : false,

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

  	readLocalFileLines: function(fname){
    		var MY_ID = "perspectives@cmu.edu";
    		var directoryService = Components.classes["@mozilla.org/file/directory_service;1"].getService(Components.interfaces.nsIProperties);
    		var profileFolder = directoryService.get("ProfD",Components.interfaces.nsIFile); 
		profileFolder.append("extensions"); 
		profileFolder.append(MY_ID); 
		profileFolder.append(fname); 

    		var istream = Components.classes["@mozilla.org/network/file-input-stream;1"].
    		createInstance(Components.interfaces.nsIFileInputStream);
    		istream.init(profileFolder, 0x01, 0444, 0);
    		istream.QueryInterface(Components.interfaces.nsILineInputStream);

    		// read lines into array
    		var hasmore;
    		var text = "";
    		var line = {};

    		var line = {}, lines = [], hasmore;
    		do {
        		hasmore = istream.readLine(line)
        		if (line.value.length > 0 && line.value[0] != "#")
        		lines.push(line.value);
    		} while(hasmore);

    		istream.close();

    		return lines;
	}, 

	readLocalFile: function(path){
    		var arr = Pers_util.readLocalFileLines(path);
    		var text = "";

    		for (i = 0; i < arr.length; i++){
        		text += arr[i] + "\n";
    		}

    		return text;
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
