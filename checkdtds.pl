#
#   This file is part of the Perspectives build system
#
#   Copyright (C) 2011 Dan Wendlandt
#
#   This program is free software: you can redistribute it and/or modify
#   it under the terms of the GNU General Public License as published by
#   the Free Software Foundation, version 3 of the License.
#
#   This program is distributed in the hope that it will be useful,
#   but WITHOUT ANY WARRANTY; without even the implied warranty of
#   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#   GNU General Public License for more details.
#
#   You should have received a copy of the GNU General Public License
#   along with this program.  If not, see <http://www.gnu.org/licenses/>.
#

use strict;
use warnings;

#Entities loaded by .xhtml files cannot contain the characters
#"%<>
#, or the page will fail to load.
#So replace any such chars with their web-safe counterparts.
#Input: .dtd entities files that will be loaded into any .xhtml page.
#Output: files with sanitized entities, with a list of issues and replacements on stdout
#
#Note: .dtd files that aren't loaded into .xhtml don't need to be scanned.


my (@files) = @ARGV;

my $errstatus = 0;

print "Checking DTDs for invalid characters and entities...\n";

for my $file (@files) {

	my $fileerrstatus = 0;

	if (! -e $file) {
		print "ERROR: file '$file' doesn't exist. Skipping.\n";
		$errstatus = 1;
		$fileerrstatus = 1;
		next;
	}
	elsif(! -f $file) {
		print "ERROR: '$file' is not a file. Skipping.\n";
		$errstatus = 1;
		$fileerrstatus = 1;
		next;
	}

	print "  $file...\n";

	#VERY IMPORTANT: read and write files using utf-8 encoding,
	#or we'll delete all of the unicode characters and mess up localization
	my $op = open(FILE, "<:encoding(utf-8)", "$file");
	if (!$op) {
		print "Cannot open '$file' for reading: $!\n";
		next;
	}

	#since entities could span multiple lines, read the whole file first and then split
	my $data;

	while (<FILE>) {
		$data .= $_;
	}

	close FILE;

	if (!$data) {
		print "No data in $file - is something wrong?\n";
		$errstatus = 1;
		$fileerrstatus = 1;
		next;
	}

	#don't write to the file in-place;
	#write to a copy and then rename the output file only if nothing went wrong.

	my $outfile = "$file.sane";

	$op = open(FILE, ">:encoding(utf-8)", "$outfile");
	if (!$op) {
		print "Cannot open '$outfile' for writing: $!\n";
		next;
	}

	my $delim = "<!";
	my $delimrx = quotemeta $delim;

	my @parts = split(/$delimrx/, $data);
	$data = "";

	for my $part (@parts){
		#entities look like
		#<!ENTITY keyName "Some text goes here!">
		if ($part =~ /(ENTITY +[A-Za-z0-9]+ +")([^"]*)(" *>[^<]*)/) {
			#save matches otherwise we lose them
			my $first = $1;
			my $ent = $2;
			my $last = $3;

			if ($ent =~ /[%<>]/) {
				$ent =~ s/%/&#37;/g;
				$ent =~ s/</&#60;/g;
				$ent =~ s/>/&#62;/g;
				my $newline = $first . $ent . $last . "\n";
				print "  Replacing '$part' with '$newline'\n";
				$part = $newline;
			}

			print FILE $delim . $part;
		}

		#comments look like:
		#<!-- any text here -->
		elsif ($part =~ /(--)([\s\S]*?)(-->[^<]*)/) {

			#save matches otherwise we lose them
			my $first = $1;
			my $inside = $2;
			my $last = $3;

			#restriction: comments cannot contain -- ,
			#or they will not load properly inside .xhtml files.
			if ($inside =~ /-{2,}/) {
				$inside =~ s/-//g;
				my $newline = $first . $inside . $last;
				print "  Invalid DTD comment: replacing '$part' with '$newline'\n";
				$part = $newline;
			}

			print FILE $delim . $part;

		}

		elsif ($part !~ /^\s*$/) { #blank line
				$fileerrstatus = 1;
				print "  Malformed entry '$part'; please run the tests and fix.\n";
		}
	}

	close FILE;

	print "  "; #spacing to make the output look pretty

	if ($fileerrstatus == 0) {
		print "Success. ";
		rename $outfile, $file;
	}

	unlink $outfile;

	print "Done\n";
}

exit $errstatus;
