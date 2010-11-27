

// convert an xml '<server>' node to a javascript object
// In JSON synatax, this object has the following format: 
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
		res.signature = Pers_xml.add_der_signature_header(sig_base64); 
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
