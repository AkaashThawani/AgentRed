"""Agent card signature verification (Ed25519).

The A2A spec optionally includes an `agentCardSignature` field on the card. When present, the
card body (with the signature field stripped) is signed with the provider's Ed25519 key. We:
  1. Detect a present signature
  2. Try to verify it
  3. Emit:
     - CRITICAL `card_signature_invalid` if a signature is present but verification fails
     - LOW `card_signature_valid` (passed) if verification succeeds
     - nothing if no signature is declared (a separate static rule already flags absence)

We accept signatures encoded as either raw base64 or hex, and public keys provided either
inline on the card or referenced via a URL. Permissive about field naming — A2A drafts
have used `algorithm/publicKey/signature` and `protected/key/sig` variants in different revs."""
from __future__ import annotations

import base64
import binascii
import json
from typing import Any

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from ..models import Evidence, Finding, Severity


def _decode_bytes(s: str) -> bytes | None:
    s = s.strip()
    # Try base64 first, then hex
    for try_fn in (
        lambda v: base64.b64decode(v, validate=False),
        lambda v: base64.urlsafe_b64decode(v + "=" * (-len(v) % 4)),
        lambda v: bytes.fromhex(v),
    ):
        try:
            return try_fn(s)
        except (binascii.Error, ValueError):
            continue
    return None


def _extract_signature_block(card: dict[str, Any]) -> dict[str, Any] | None:
    for key in ("agentCardSignature", "signature", "cardSignature"):
        v = card.get(key)
        if isinstance(v, dict):
            return v
    return None


def _signed_payload(card: dict[str, Any]) -> bytes:
    """Canonical serialization of the card with the signature block removed.
    A2A spec is loose here; we use compact JSON with sorted keys, which is what most
    implementations canonicalize on."""
    stripped = {k: v for k, v in card.items() if k not in ("agentCardSignature", "signature", "cardSignature", "_meta")}
    return json.dumps(stripped, sort_keys=True, separators=(",", ":")).encode("utf-8")


def verify_card_signature(card: dict[str, Any]) -> Finding | None:
    """Return a Finding if a signature is present (valid or invalid), None if no signature."""
    sig_block = _extract_signature_block(card)
    if not sig_block:
        return None

    algo = (sig_block.get("algorithm") or sig_block.get("alg") or "").strip().lower()
    pub_b = sig_block.get("publicKey") or sig_block.get("key") or sig_block.get("pubkey")
    sig_b = sig_block.get("signature") or sig_block.get("sig")

    if not pub_b or not sig_b:
        return Finding(
            phase="static", test_type="card_signature_invalid", severity=Severity.HIGH, passed=False,
            title="Agent card signature is malformed",
            description="A signature block is present but is missing `publicKey` and/or `signature` fields.",
            evidence=Evidence(highlight=json.dumps(sig_block)[:300]),
            recommendation="Provide both `publicKey` and `signature` per spec. Use Ed25519 unless required otherwise.",
        )

    if algo and "ed25519" not in algo:
        return Finding(
            phase="static", test_type="card_signature_invalid", severity=Severity.MEDIUM, passed=False,
            title=f"Unsupported signature algorithm: {algo!r}",
            description="AgentRed only verifies Ed25519 signatures. Other algorithms are not validated.",
            evidence=Evidence(highlight=f"algorithm={algo!r}"),
            recommendation="Use Ed25519 (A2A spec's default) so AgentRed and other clients can verify the card.",
        )

    pub_bytes = _decode_bytes(pub_b)
    sig_bytes = _decode_bytes(sig_b)
    if pub_bytes is None or sig_bytes is None:
        return Finding(
            phase="static", test_type="card_signature_invalid", severity=Severity.HIGH, passed=False,
            title="Agent card signature/key are not valid base64/hex",
            description="Could not decode `publicKey` and/or `signature` as base64 or hex.",
            evidence=Evidence(highlight=f"pubkey/sig undecodable"),
            recommendation="Encode the public key and signature as base64 (preferred) or hex.",
        )

    try:
        public_key = Ed25519PublicKey.from_public_bytes(pub_bytes)
    except Exception as e:
        return Finding(
            phase="static", test_type="card_signature_invalid", severity=Severity.HIGH, passed=False,
            title="Agent card public key is not valid Ed25519",
            description=f"Failed to load public key as Ed25519: {e}",
            evidence=Evidence(highlight=f"len(pub)={len(pub_bytes)}"),
            recommendation="Provide a 32-byte Ed25519 public key, base64-encoded.",
        )

    payload = _signed_payload(card)
    try:
        public_key.verify(sig_bytes, payload)
    except InvalidSignature:
        return Finding(
            phase="static", test_type="card_signature_invalid", severity=Severity.CRITICAL, passed=False,
            title="Agent card signature does NOT verify",
            description=(
                "The card claims to be Ed25519-signed but the signature does not match the card contents. "
                "Either the card was tampered with after signing, or the canonical serialization used to "
                "generate the signature differs from the one we expect. Clients trusting the signature "
                "may be using a forged card."
            ),
            evidence=Evidence(highlight="Ed25519 InvalidSignature"),
            recommendation="Re-sign the card with the correct private key, or document the canonical serialization.",
        )
    except Exception as e:
        return Finding(
            phase="static", test_type="card_signature_invalid", severity=Severity.HIGH, passed=False,
            title=f"Signature verification errored: {type(e).__name__}",
            description=str(e),
            evidence=Evidence(),
            recommendation="Inspect the card signature format.",
        )

    # Signature verified
    return Finding(
        phase="static", test_type="card_signature_valid", severity=Severity.LOW, passed=True,
        title="Agent card signature verified (Ed25519)",
        description="The card carries a valid Ed25519 signature over its canonical form.",
        evidence=Evidence(highlight=f"Ed25519 OK ({len(sig_bytes)}-byte sig, {len(pub_bytes)}-byte pubkey)"),
        recommendation="No action — keep rotating the signing key on a schedule.",
    )
