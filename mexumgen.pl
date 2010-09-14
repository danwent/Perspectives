#!/usr/bin/perl
#Ethan Jackosn found this at http://www.softlights.net/projects/mexumgen/
#*******************************************************************************
#   Mozilla Extension Update Manifest Generator, version 1.1
#   Copyright (C) 2008 Sergei Zhirikov (sfzhi@yahoo.com)
#   This software is available under the GNU General Public License v3.0
#       (http://www.gnu.org/licenses/gpl-3.0.txt)
#*******************************************************************************
use strict;
use warnings;
use Pod::Usage;
use Getopt::Std;
use MIME::Base64;
use Convert::ASN1;
use RDF::Core::Parser;
use File::Spec::Functions qw(catfile tmpdir curdir);
#*******************************************************************************
use constant NSMOZ => 'http://www.mozilla.org/2004/em-rdf#';
use constant NSRDF => 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
use constant sha512WithRSAEncryption => ':1.2.840.113549.1.1.13';
#*******************************************************************************
@ARGV or pod2usage(-exitval => 1, -verbose => 99, -sections => 'NAME|SYNOPSIS');
#*******************************************************************************
$Getopt::Std::STANDARD_HELP_VERSION = 1;
sub VERSION_MESSAGE {
    pod2usage(-exitval => 'NOEXIT', -verbose => 99, -sections => 'NAME');
}
sub HELP_MESSAGE {
    pod2usage(-exitval => 'NOEXIT', -verbose => 1);
}
#*******************************************************************************
our %opt;
getopts('i:o:k:p:hw', \%opt) or die "Use '--help' to see available options\n";
our ($rdf, $out, $pem, $pwd) = @opt{qw[i o k p]};
our $grp = $opt{w}? 3: 2;
#*******************************************************************************
@ARGV % $grp == 0 or die "The number of arguments must be multiple of $grp\n";
our (@xpi, %xpi);
while (@ARGV > 0) {
    my ($xpi, $url, $inf) = splice(@ARGV, 0, $grp);
    push(@xpi, {xpi => $xpi, url => $url, $inf? (inf => $inf): ()});
    $xpi{$xpi} = $#xpi;
}
$rdf || @xpi or die "At least one input file is required\n";
#*******************************************************************************
our $tmp = catfile(tmpdir() || curdir(), "update.rdf.mexumgen.$$.tmp");
#*******************************************************************************
sub rdf($) {
    my $tree = {};
    (new RDF::Core::Parser(Assert => sub {
        my %item = @_;
        push(@{$tree->{$item{'subject_uri'}}->
            {$item{'predicate_ns'}}->{$item{'predicate_name'}}},
            {uri => $item{'object_uri'}, lit => $item{'object_literal'}});
    }))->parse(shift);
    return $tree;
}
#*******************************************************************************
for my $xpi (@xpi) {
    my $txt = qx[unzip -jnpq "$xpi->{xpi}" install.rdf];
    $? == 0 or die "Could not extract install manifest from '$xpi->{xpi}'\n";
    my $rdf = rdf($txt);
    my $all = $rdf->{'urn:mozilla:install-manifest'}->{NSMOZ()};
    my ($ext, $ver) = map {
        (defined($_) && (@{$_} == 1))? $_->[0]->{lit}: undef;
    } @$all{'id', 'version'};
    my @app = map {
        my $uri = $_->{uri};
        (defined($uri) && exists($rdf->{$uri}))? (sub {
            my ($app, $min, $max) = map {
                (defined($_) && (@{$_} == 1))? $_->[0]->{lit}: undef;
            } @{$rdf->{$uri}->{NSMOZ()}}{'id', 'minVersion', 'maxVersion'};
            {app => $app, min => $min, max => $max};
        })->(): ();
    } @{$all->{'targetApplication'}};
    $xpi->{ext} = $ext;
    $xpi->{ver} = $ver;
    $xpi->{app} = \@app;
}
#*******************************************************************************
if (@xpi && ($pem || $opt{h})) {
    open(SHA, '-|', 'openssl sha1 -hex '.join(' ', map {qq["$_->{xpi}"]} @xpi))
        or die "Failed to start OpenSSL to calculate SHA1 hashes: $!\n";
    while(<SHA>) {
        if (/^SHA1\((.*?)\)=\s*([[:xdigit:]]{40})\s*$/) {
            $xpi[$xpi{$1}]->{sha} = "sha1:$2" if (exists($xpi{$1}));
        }
    }
    close(SHA);
    $? == 0 or die "OpenSSL failed to calculate SHA1 hashes\n";
}
#*******************************************************************************
our %ext = ();
our @ext = ();
for my $xpi (@xpi) {
    if (my $ext = $xpi->{ext}) {
        push(@ext, $ext) unless (exists($ext{$ext}));
        push(@{$ext{$ext}}, $xpi);
    }
}
#*******************************************************************************
sub ser(*$$$$);
sub ser(*$$$$) {
    my ($file, $tree, $offs, $incr, $mode) = @_;
    my ($name, $data, $attr) = @$tree;
    my $sort = $mode && $name =~ s/^rdf:/RDF:/;
    if (ref($data)) {
        $attr = $attr? ' '.($mode? '': 'rdf:').'about="'.$attr.'"': '';
        print $file "$offs<$name$attr>\n";
        for my $item ($sort? sort({$a->[0] cmp $b->[0]} @$data): @$data) {
            ser($file, $item, $offs.$incr, $incr, $mode);
        }
        print $file "$offs</$name>\n";
    } elsif ($name ne 'em:signature') {
        print $file "$offs<$name>$data</$name>\n";
    } elsif (!$mode) {
        print $file "$offs<$name>\n";
        print $file "$offs$incr", substr($data, 0, 64, ''), "\n" while ($data);
        print $file "$offs</$name>\n";
    }
}
#*******************************************************************************
use constant BUFFER => 32768; # Must be BUFFER > max(length($signature))
sub sig($) {
    open(RDF, '>', $tmp) or die "Failed to create a temporary file: $!\n";
    binmode(RDF);
    ser(*RDF, shift, '', '  ', 1);
    close(RDF);
#- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    open(SIG, '-|', qq[openssl dgst -sha512 -sign "$pem" -binary "$tmp"])
        or die "Failed to start OpenSSL to generate the signature: $!\n";
    binmode(SIG);
    my $body;
    my $size = read(SIG, $body, BUFFER);
    close(SIG);
    $? == 0 or die "OpenSSL failed to generate the signature\n";
#- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    if (($size > 0) && ($size < BUFFER) && ($size == length($body))) {
        my $asn1 = Convert::ASN1->new(encoding => 'DER');
        $asn1->prepare(q<
            Algorithm ::= SEQUENCE {
                oid OBJECT IDENTIFIER,
                opt ANY OPTIONAL
            }
            Signature ::= SEQUENCE {
                alg Algorithm,
                sig BIT STRING
            }
        >);
        my $data = $asn1->encode(sig => $body,
            alg => {oid => sha512WithRSAEncryption()});
        if (defined($data)) {
            return encode_base64($data, '');
        } else {
            die "Failed to encode the generated signature: ".$asn1->error."\n";
        }
    } else {
        die "Failed to obtain the generated signature from OpenSSL\n";
    }
}
#*******************************************************************************
if (defined($rdf)) {
    die "Signing an existing update manifest is not supported yet\n";
}
#*******************************************************************************
for my $ext (values(%ext)) {
    @$ext = sort {
        my @ab = map {$_->{ver}} ($a, $b);
        my ($ax, $bx) = map {[map {($_ eq '*')? '*': [('0') x !/^-?\d/,
            split /(?<=\d)(?=\D)|(?<=[^-\d])(?=-?\d)/]} split /\./]} @ab;
        push(@$ax, (['0']) x ($#$bx - $#$ax)) if ($#$ax < $#$bx);
        push(@$bx, (['0']) x ($#$ax - $#$bx)) if ($#$bx < $#$ax);
        my $cmp = 0;
        for my $ay (@$ax) {
            my $by = shift @$bx;
            if (ref($ay) && ref($by)) {
                foreach my $i (0..(($#$ay > $#$by)? $#$ay: $#$by)) {
                    my ($az, $bz) = ($ay->[$i], $by->[$i]);
                    $cmp = ($i % 2)? ((defined($bz) <=> defined($az)) ||
                        ($az cmp $bz)): (($az || 0) <=> ($bz || 0));
                    return $cmp if $cmp;
                }
            } else {
                $cmp = !ref($ay) <=> !ref($by);
            }
            return $cmp if $cmp;
        }
        return 0;
    } @$ext if (@$ext > 1);
}
#*******************************************************************************
our @rdf = map {
    ['rdf:Description' => [
        ['em:updates' => [
            ['rdf:Seq' => [
                (map {
                    my $upd = $_;
                    ['rdf:li' => [
                        ['rdf:Description' => [
                            ['em:version' => $upd->{ver}],
                            (map {
                                ['em:targetApplication' => [
                                    ['rdf:Description' => [
                                        ['em:id' => $_->{app}],
                                        ['em:minVersion' => "3.0"],
                                        ['em:maxVersion' => $_->{max}],
                                        ['em:updateLink' => $upd->{url}],
                                        exists($upd->{sha})?
                                        ['em:updateHash' => $upd->{sha}]: (),
                                        exists($upd->{inf})?
                                        ['em:updateInfoURL' => $upd->{inf}]: ()
                                    ]]
                                ]]
                            } @{$upd->{app}})
                        ]]
                    ]]
                } @{$ext{$_}})
            ]]
        ]]
    ], 'urn:mozilla:extension:'.$_]
} @ext;
#*******************************************************************************
if ($pem) {
    push(@{$_->[1]}, ['em:signature' => sig($_)]) for (@rdf);
}
#*******************************************************************************
use constant INDENT => ' ' x 4;
if (defined($out)) {
    open(RDF, '>', $out) or die "Failed to open the output file '$out': $!\n";
} else {
    open(RDF, '>&', \*STDOUT) or die "Failed to open output stream: $!\n";
}
print RDF <<'RDF';
<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
        xmlns:em="http://www.mozilla.org/2004/em-rdf#">
RDF
ser(*RDF, $_, INDENT(), INDENT(), 0) for (@rdf);
print RDF "</rdf:RDF>\n";
close(RDF);
#*******************************************************************************
#END { unlink($tmp) if (defined($tmp) && (-e $tmp)); }
#*******************************************************************************
=pod

=head1 NAME

mexumgen - Mozilla Extension Update Manifest Generator, version 1.1

=head1 SYNOPSIS

menumgen [-h | -k key.pem] [-w] [-o out.rdf] etc...

=head1 ARGUMENTS

=over 2

=item B<-h>

Calculate SHA1 hash of every installation package and include it in the update
manifest. If B<-k> option is present this is implied.

=item B<-k key.pem>

The private key to sign the update manifest with. Typically it is 1024-bit RSA
key in PEM format. If this parameter is omitted the update manifest will not be
signed.

=item B<-w>

Indicates that C<updateInfoURL> (a.k.a "What's new") should be included in the
generated update manifest. This changes the meaning of the tail of the command
line (see B<etc> below).

=item B<-o out.rdf>

The output update manifest file (generated and signed). This can be the same
file as specified with B<-i> option. If this parameter is omitted the resulting
update manifest will be written to the standard output.

=item B<etc>

The remaining command line arguments specify the installation packages to be
used and the corresponding URLs.

If B<-w> option is present, the number of remaining
arguments must be multiple of 3. Each group of 3 arguments specifies (in that
order): the path to the installation package in the local file system, the URL
where that package is going to be available, the URL of the "What's new" page
for the package.

If B<-w> option is not present, the number
of remaining arguments must be multiple of 2. Each pair of arguments specifies
the path to the installation package in the local file system and the URL where
that package is going to be available.

In other words, the B<-w> option indicates whether "What's new" URLs must be
present in the list of the installation packages.

=back

=head1 DESCRIPTION

The F<install.rdf> file found in each installation package specified in the
command line is parsed to retrieve the information about the extension (I<id>,
I<version>) and about the target application(s) (I<id>, I<minVersion>,
I<maxVersion>). Also, if the update manifest is to be signed or if B<-h>
command line option is present, the SHA1 hash of each installation package
(xpi file) is calculated. That information is used to construct a new update
manifest.

=head1 EXAMPLE

menumgen -k key.pem -w -o update.rdf extension.xpi
    http://www.example.com/download/extension.xpi
    http://www.example.com/extension/update.xhtml

=head1 KNOWN ISSUES

The I<targetPlatform> from the installation packages is not taken into account.

If the key is encrypted the password must be entered interactively, there is
no way to specify it on the command line.

Signing an existing update manifest is not supported in the current version.

=head1 DEPENDENCIES

Convert::ASN1, XML::Parser, RDF::Core, openssl, unzip

=head1 HOME PAGE

L<http://www.softlights.net/projects/mexumgen/>

=head1 DOWNLOAD

L<http://www.softlights.net/projects/mexumgen/mexumgen.zip>

=head1 AUTHORS

Copyright (C) 2008 Sergei Zhirikov (sfzhi@yahoo.com)

=cut
