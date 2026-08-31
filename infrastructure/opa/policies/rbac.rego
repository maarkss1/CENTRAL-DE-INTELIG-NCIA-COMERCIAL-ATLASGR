# RBAC Policy — AtlasGR
# Define quais roles podem acessar quais recursos.
# Consultado pelo middleware authorization.ts via HTTP POST http://opa:8181/v1/data/atlasgr/rbac/allow

package atlasgr.rbac

import rego.v1

# ─────────────────────────────────────────────────────────────────────────────
# Roles definidas no sistema
# ─────────────────────────────────────────────────────────────────────────────
# admin       — acesso irrestrito
# manager     — acesso a CRM, Empresas, Contatos, Atividades, Analytics, Time
# sdr         — acesso a Prospecção, Contatos, Atividades, Chatbook, IA
# bdr         — acesso a Prospecção, Empresas, Contatos
# closer      — acesso a CRM, Contatos, Atividades, IA
# viewer      — somente leitura (sem criação/edição/exclusão)

# ─────────────────────────────────────────────────────────────────────────────
# Matriz de permissões: role → {recurso: [ações permitidas]}
# ─────────────────────────────────────────────────────────────────────────────
permissions := {
    "admin": {
        "*": ["read", "write", "delete", "admin"]
    },
    "manager": {
        "companies":    ["read", "write", "delete"],
        "contacts":     ["read", "write", "delete"],
        "deals":        ["read", "write", "delete"],
        "activities":   ["read", "write", "delete"],
        "analytics":    ["read"],
        "team":         ["read", "write"],
        "reports":      ["read"],
        "intelligence": ["read", "write"],
        "automations":  ["read", "write"],
        "integrations": ["read"]
    },
    "sdr": {
        "prospects":    ["read", "write"],
        "contacts":     ["read", "write"],
        "activities":   ["read", "write"],
        "intelligence": ["read", "write"],
        "chatbook":     ["read", "write"],
        "cadence":      ["read", "write"]
    },
    "bdr": {
        "prospects":    ["read", "write"],
        "companies":    ["read", "write"],
        "contacts":     ["read", "write"],
        "activities":   ["read", "write"]
    },
    "closer": {
        "deals":        ["read", "write"],
        "contacts":     ["read", "write"],
        "activities":   ["read", "write"],
        "intelligence": ["read"],
        "chatbook":     ["read", "write"]
    },
    "viewer": {
        "companies":    ["read"],
        "contacts":     ["read"],
        "deals":        ["read"],
        "activities":   ["read"],
        "analytics":    ["read"],
        "reports":      ["read"]
    }
}

# ─────────────────────────────────────────────────────────────────────────────
# Regra principal: allow = true | false
#
# Input esperado:
#   {
#     "user":     { "role": "sdr", "organizationId": "org_123" },
#     "resource": "contacts",
#     "action":   "write",
#     "resourceOrganizationId": "org_123"  ← tenancy check
#   }
# ─────────────────────────────────────────────────────────────────────────────
default allow := false

allow if {
    # Tenancy: usuário só acessa recursos da própria organização
    input.user.organizationId == input.resourceOrganizationId

    # Admin tem acesso irrestrito
    input.user.role == "admin"
}

allow if {
    # Tenancy check
    input.user.organizationId == input.resourceOrganizationId

    role_permissions := permissions[input.user.role]

    # Verifica wildcard (admin) ou recurso específico
    some resource in [input.resource, "*"]
    allowed_actions := role_permissions[resource]
    input.action in allowed_actions
}

# ─────────────────────────────────────────────────────────────────────────────
# Helpers para diagnóstico (úteis em testes)
# ─────────────────────────────────────────────────────────────────────────────
user_roles[role] if {
    role := input.user.role
}

resource_permissions[action] if {
    role_permissions := permissions[input.user.role]
    some resource in [input.resource, "*"]
    allowed_actions := role_permissions[resource]
    action := allowed_actions[_]
}
