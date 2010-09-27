/* 
 This file implements a lot of the client side policy functionality 
 assuming JSON formatted data.  
*/ 

var Pers_client_policy = { 

sort_number_list_desc : function(list){ 
	function sortNumber(a,b){ return b - a; }
	list.sort(sortNumber); 
}, 


find_key_at_time : function(server_results,desired_time) { 
 for(i = 0; i < server_results.obs.length; i++) { 
		var cur_obs = server_results.obs[i];
		Pers_debug.d_print("policy", "key: " + cur_obs.key); 
		for(j = 0; j < cur_obs.timestamps.length; j++) { 
			var test_end = cur_obs.timestamps[j].end;
			var test_start = cur_obs.timestamps[j].start;
			Pers_debug.d_print("policy", "start: " + test_start + 
						" end: " + test_end); 
			if(desired_time >= test_start && desired_time <= test_end) { 
				return cur_obs.key;  
			}
		} 
 }
 return null; 
}, 

find_most_recent : function(server_results) { 
 var most_recent_time = 0; 
 for(var i = 0; i < server_results.obs.length; i++) { 
		var cur_obs = server_results.obs[i]; 
		for(var j = 0; j < cur_obs.timestamps.length; j++) { 
			var test_time = cur_obs.timestamps[j].end;
			if(test_time > most_recent_time) 
				most_recent_time = test_time; 
		} 
 }
 return most_recent_time; 
}, 

find_oldest_most_recent : function(results, stale_limit_secs,cur_time){
	var stale_limit = cur_time - stale_limit_secs; 
	var oldest_most_recent = cur_time + stale_limit_secs;
	for(var i = 0; i < results.length; i++) { 
		var most_recent = Pers_client_policy.find_most_recent(results[i]);
		if(most_recent && (most_recent < oldest_most_recent)) { 
			if(most_recent > stale_limit) 
				oldest_most_recent = most_recent; 
		}
	}
	return oldest_most_recent; 
}, 


get_num_valid_notaries: function(test_key,results,stale_limit_secs,cur_time){
	var stale_limit = cur_time - stale_limit_secs;
	var num_valid = 0; 
	for(var i = 0; i < results.length; i++) { 
			var mr_time = Pers_client_policy.find_most_recent(results[i]); 
			if(mr_time == 0 || mr_time < stale_limit) {  
				Pers_debug.d_print("policy", "no non-stale keys"); 
				continue;
			}
			var cur_key = Pers_client_policy.find_key_at_time(results[i], mr_time);
			Pers_debug.d_print("policy", "cur_key : " + cur_key); 
			Pers_debug.d_print("policy", "test_key : " + test_key);  
			if(cur_key == test_key) {
				Pers_debug.d_print("policy", "match for server: " + 
						results[i].server); 
				num_valid++; 
			}else { 
				Pers_debug.d_print("policy", "mismatch on most-recent key"); 
			}
	}
	return num_valid; 
}, 

get_all_key_changes : function(results) { 
	var change_set = {}; 
	for(var i = 0; i < results.length; i++) { 
		for(var j = 0; j < results[i].obs.length; j++) { 
			for(var k = 0; k < results[i].obs[j].timestamps.length; k++) { 
				var ts = results[i].obs[j].timestamps[k]; 
				change_set[ts.start] = ""; 
				change_set[ts.end] = ""; 
			}
		}
	}
  	var change_list = []; 
	var x; 
	for (x in change_set) { 
		change_list.push(x); 
	}
	return change_list; 
} , 

check_current_consistency : function(test_key,results,quorum_size,stale_limit_secs,cur_time) {
  	//get_all_key_changes(results); 
	var num_valid = Pers_client_policy.get_num_valid_notaries(test_key,results,stale_limit_secs,cur_time);
	Pers_debug.d_print("policy", 
		"cur_consistency: " + num_valid + " with q = " + quorum_size); 
	return num_valid >= quorum_size; 
}, 

has_quorum_at_time : function(test_key, results, quorum_size, time) {
	Pers_debug.d_print("policy", "testing quorum for time " + time + 
			" and key: " + test_key); 
	var total_valid = 0; 
	for(var i = 0; i < results.length; i++) { 
		if(results[i].obs.length == 0){ 
			Pers_debug.d_print("policy", 
				results[i].server + " has no results"); 
			continue; 
		}
		var cur_key = Pers_client_policy.find_key_at_time(results[i],time); 
		if(cur_key == null) {
			Pers_debug.d_print("policy", results[i].server + " has no key"); 
			continue; 
		}
		if(cur_key == test_key) {
			Pers_debug.d_print("policy", results[i].server + " matched"); 
			total_valid++; 
		}else { 
			Pers_debug.d_print("policy", results[i].server + 
				" had different key: " + cur_key); 
		}
	}
	return total_valid >= quorum_size; 
} , 



get_quorum_duration : function(test_key, results, quorum_size, stale_limit_secs, unixtime) { 

	if(! Pers_client_policy.check_current_consistency(test_key,results,quorum_size,
					stale_limit_secs,unixtime)) { 
		Pers_debug.d_print("policy","current_consistency_failed"); 
		return -1; 
	}
	var oldest_valid_ts = unixtime; 	
	var oldest_most_recent = Pers_client_policy.find_oldest_most_recent(results,unixtime,stale_limit_secs); 
  	var time_changes = Pers_client_policy.get_all_key_changes(results); 
	Pers_client_policy.sort_number_list_desc(time_changes); 
	Pers_debug.d_print("policy", "sorted times: ", time_changes); 
  	var test_time = null; 
	for(var i = 0; i < time_changes.length; i++) {
		test_time = time_changes[i]; 
		if(time_changes[i] > oldest_most_recent) { 
			Pers_debug.d_print("policy","skipping test_time = " + test_time); 
			continue; 
		}
		if(!Pers_client_policy.has_quorum_at_time(test_key,results,quorum_size,test_time)) { 
			Pers_debug.d_print("policy", 
				"quorum failed for time " + test_time); 
			break; 
		}
		oldest_valid_ts = test_time;  
	}
	if(oldest_valid_ts === null) { 
		return 0; 
	} 
	var diff = unixtime - oldest_valid_ts + 1; 
	return (diff > 0) ? diff : 0;  
}, 

// For sites that do not consistently use a single certificate, Perspectives supports
// a weaker notion of whether a key is 'valid', called 'weak consistentcy'.  
// This test checks that two things are BOTH true: 
// 1) confirm that no notary has consistently seen any key for this website.  We do this
// by checking that in the past 'check_length' days, no notary has seen the
// same key for more than 'max_timespan' days.  The goal of this check is to make sure
// weak consistency cannot be used by an attacker to undermine a site that regularly 
// uses a single 'correct' key. 
// 2) that 'test' key has been seen by at least 'qourum_size' notaries in the past 
// 'check_length' days.  Note that this is MUCH weaker than standard perspectives 
// requirement that notaries must have seen a key consistently over time.  Even a single
// observation by all notaries could undermine this form of consistency.  

// This technique is implemented by the functions 'key_weakly_seen_by_quorum' and 'inconsistency_check' 

key_weakly_seen_by_quorum : function(test_key, results, quorum_size, check_length){ 
 	var cutoff_sec = Pers_util.get_unix_time() - Pers_util.DAY2SEC(check_length); 

	for(var i = 0; i < results.length; i++) {
		var seen = false;  
		for(var j = 0; j < results[i].obs.length; j++) { 
			if(results[i].obs[j].key != test_key) { 
				continue; 
			} 		
			for(var k = 0; k < results[i].obs[j].timestamps.length; k++) { 
				var ts = results[i].obs[j].timestamps[k]; 
				if (ts.end >= cutoff_sec) { 
					seen = true; 
					break; 
				}  
			}
		}
		if(!seen) { 
			return false; 
		} 
	}
	return true; 
}, 


// returns true if 'results' contains replies that are all 'inconsistent', which 
// according to our definition means that there was non timepsan longer than 
// 'max_timespan' in the last 'check_length' days. 
inconsistency_check : function(results, max_timespan, check_length) { 
	
	for(var i = 0; i < results.length; i++) { 
		var max_ts_sec = this.calc_longest_timespan(results[i].obs, 
									check_length); 
		if(max_timespan < Pers_util.SEC2DAY(max_ts_sec)) { 
			return false; 
		} 
	} 
	return true; 
},  

// find the longest single timespan for the results from a single notary
calc_longest_timespan : function(obs_list, check_length) {  
 	var cutoff_sec = Pers_util.get_unix_time() - Pers_util.DAY2SEC(check_length); 
	var max_diff = 0; 
	for(var j = 0; j < obs_list.length; j++) { 
		for(var k = 0; k <  obs_list[j].timestamps.length; k++) { 
			var ts = obs_list[j].timestamps[k];
			// be generous.  count it if timespan at least ended in 
			// the last 'check_length' days
			if(ts.end < cutoff_sec) { 
				continue; 
			} 
			var diff = ts.end - ts.start; 
			if (diff > max_diff) { 
				max_diff = diff; 
			}  
		}
	}
	return max_diff; 
}

} 
