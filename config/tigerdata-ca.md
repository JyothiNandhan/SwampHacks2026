# Tiger Data database CA

`tigerdata-ca.pem` contains the public Timescale CA presented by the configured
Tiger Data trial service on October 17, 2026. It contains no private key or
connection credentials. The observed chain signature, certificate validity and
configured service hostname were checked before a successful database connection.
The CA was obtained from that service's certificate chain, rather than independently
verified against a published provider fingerprint.

SHA-256: `06:5A:75:0D:0D:64:F6:2D:AC:DC:97:9E:3B:83:D2:11:95:40:71:EA:59:B8:F3:40:7C:4E:87:CA:68:34:64:57`

The Docker image sets `NODE_EXTRA_CA_CERTS=/app/config/tigerdata-ca.pem` before
starting Node. This adds the pinned CA to Node's normal trust roots; TLS chain and
hostname verification remain enabled. This also covers the existing `pg` migration
client and the worker. Do not set `NODE_TLS_REJECT_UNAUTHORIZED=0` or disable
`rejectUnauthorized`.

For local commands, set NODE_EXTRA_CA_CERTS to the absolute path of this PEM before
starting Node. Preserve the database URL's TLS settings; `sslmode=verify-full`
explicitly selects hostname and chain validation. If Railway has an explicit
NODE_EXTRA_CA_CERTS override, make it match the container path above.

The certificate expires October 20, 2027. Before changing or replacing the pin,
confirm the provider's certificate identity through authenticated provider support
or an independently trusted channel. A publicly signed replacement should work
through Node's existing roots without removing this additional certificate.

Provider reference: https://docs.timescale.com/use-timescale/latest/security/strict-ssl/
