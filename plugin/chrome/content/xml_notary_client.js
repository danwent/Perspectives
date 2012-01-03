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



// convert an xml '<server>' node to a javascript object
// In JSON syntax, this object has the following format: 
/* { "signature" : "XXXX", 
     "obs" : [  { "key" : "XXX", 
 		  "timestamps" : [ { "start" : XXX, "end" : YYY } ]
		} 
	     ] 
   }
*/  
var Pers_xml = {
	parse_server_node: function(reply, expected_version) { 

        	if(reply.nodeName != "notary_reply"){
			return null;
        	}
		var version = reply.attributes.getNamedItem("version").value; 
		if(version != expected_version) { 
			Pers_debug.d_print("error","Expected version '" + expected_version
				+ "' but got version '" + version + "'");
			return null; 
		}
        
		var res = new Object();
		var sig_type = reply.attributes.getNamedItem("sig_type").value; 
		if(sig_type != "rsa-md5") {
			// in the future, we will support 'rsa-sha256' as well 
			Pers_debug.d_print("error","Expected sig_type 'rsa-md5' " + 
				"but got sig_type '" + sig_type + "'");
			return null; 
		} 
		var sig_base64 = reply.attributes.getNamedItem("sig").value; 
		res.signature = Pers_util.add_der_signature_header(sig_base64); 
		res.obs     = new Array();
		for (var j = 0; j < reply.childNodes.length; j++){
			var keynode = reply.childNodes[j];
			if (keynode.nodeName != "key"){
				continue; 
			}

			var key_info = { 
				"key" : keynode.attributes.getNamedItem("fp").value, 
				"key_type" : keynode.attributes.getNamedItem("type").value, 
				"timestamps" : [] 
			}; 
			for (var k = 0; k < keynode.childNodes.length; k++){
				var tsnode = keynode.childNodes[k];
				if (tsnode.nodeName != "timestamp"){
					continue;
				}
				key_info.timestamps.push({ 
					"start" : tsnode.attributes.getNamedItem("start").value, 
					"end" : tsnode.attributes.getNamedItem("end").value
				}); 
            }
			res.obs.push(key_info); 
        }
		return res; 
	},


	// Dumps all data in a server response to a string for easy debugging
	resultToString: function(server_result,show_sig){
		var out = ""; 
		for(var j = 0; j < server_result.obs.length; j++) { 
			var o = server_result.obs[j]; 
			out += "ssl key: '" + o.key + "'\n";
			for(var k = 0; k < o.timestamps.length; k++){
				var start_t = o.timestamps[k].start; 
				var end_t = o.timestamps[k].end; 
				var start_d = new Date(1000 * start_t).toDateString();  
				var end_d = new Date(1000 * end_t).toDateString();  
				out += "start:\t" + start_t + " - " + start_d + "\n"; 
				out += "end:  \t" + end_t + " - " + end_d + "\n"; 
				out += "(" + parseInt((end_t - start_t) / (3600 * 24)) + " days)\n\n";
			}   
		} 
		if(server_result.obs.length == 0) { 
			out += "[ No Results ]"; 
		}	 
		if(show_sig) { 
			out += "\tsignature = '" + server_result.signature + "'\n";  
		}
		return out;
	}, 

	//Note: the signature is computed over data in 
	// network byte order (big endian) so we should do
	// the same. 
	// each observation has:
	// service-id (variable length, terminated with null-byte) 
	// num_timespans (2-bytes)
	// key_len_bytes (2-bytes, always has value of 16 for now
	// key type (1-byte), always has a value of 3 for SSL 
	// key data (length specified in key_len_bytes) 
	// list of timespan start,end pairs  (length is 2 * 4 * num_timespans)
	// FIXME: The different keys actually need to be in the same order as 
	// they were on the server, in order to compute the signature correctly.
	// The xml seems to be parsed in a consistent way, but I don't know if
	// that is guaranteed to be the case.  
	pack_result_as_binary: function(server_res,service_id) { 
		var bin_str = service_id;
		bin_str += String.fromCharCode(0); // NULL-terminate
	 
		for (i = server_res.obs.length - 1; i >= 0; i--) { 
			var o = server_res.obs[i];
			var num_timespans = o.timestamps.length; 
			bin_str += String.fromCharCode((num_timespans >> 8) & 255, 
											num_timespans & 255); 
			bin_str += String.fromCharCode(0,16,3); // key length is 16, type 3
			var hex_array = o.key.split(":"); 
			for(k = 0; k < hex_array.length; k++) { 
				bin_str += String.fromCharCode((parseInt(hex_array[k],16))); 
			}
			for (j = 0; j < o.timestamps.length; j++) { 
				var t = o.timestamps[j]; 
				bin_str += String.fromCharCode((t.start >> 24) & 255, 
							(t.start >> 16) & 255, 
							(t.start >> 8) & 255, 
							t.start & 255);  
				bin_str += String.fromCharCode((t.end >> 24) & 255, 
							(t.end >> 16) & 255, (t.end >> 8) & 255, 
							t.end & 255);  
			}
		} 
	
		return bin_str; 
	}
} 
