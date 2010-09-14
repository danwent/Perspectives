
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
		try { 
			if(!Pers_debug.d_print_flags[flag] && !Pers_debug.d_print_all) 
				return; 
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
		} catch(e) { 
			alert(e); 
		} 
	}
}

var Pers_util = {
	get_unix_time: function() { 
		var foo = new Date(); // Generic JS date object
		var unixtime_ms = foo.getTime(); // Returns milliseconds since the epoch
		return parseInt(unixtime_ms / 1000);
	},

	SEC2DAY: function(sec) { return sec / (3600 * 24); },
	DAY2SEC: function(day) { return day * (3600 * 24); }
 
}
