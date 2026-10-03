import streamlit as st
import requests
import plotly.express as px
import plotly.graph_objects as go
import pandas as pd
from datetime import datetime

API = "http://127.0.0.1:8000"

st.set_page_config(
    page_title="Smart Finance Dashboard",
    page_icon="💰",
    layout="wide"
)

st.markdown("""
<style>
    .metric-card {
        background: #f8f9fa;
        border-radius: 10px;
        padding: 1rem;
        border-left: 4px solid #4CAF50;
    }
    .anomaly-card {
        background: #fff3f3;
        border-radius: 10px;
        padding: 0.8rem;
        border-left: 4px solid #e74c3c;
        margin-bottom: 8px;
    }
</style>
""", unsafe_allow_html=True)

# ── Sidebar ──────────────────────────────────────────
with st.sidebar:
    st.title("💰 Finance Dashboard")
    st.markdown("---")
    user_id = st.number_input("User ID", min_value=1, value=1, step=1)
    now = datetime.now()
    month = st.selectbox("Mois", list(range(1, 13)), index=now.month - 1)
    year = st.number_input("Année", min_value=2024, max_value=2030, value=now.year)
    st.markdown("---")

    if st.button("🔍 Détecter les anomalies", use_container_width=True):
        with st.spinner("Analyse en cours..."):
            r = requests.post(f"{API}/ml/detect-anomalies?z_threshold=2.0")
            if r.status_code == 200:
                data = r.json()
                st.success(f"{data['anomalies_found']} anomalie(s) détectée(s)")
            else:
                st.error("Erreur lors de la détection")

    if st.button("🤖 Entraîner le modèle", use_container_width=True):
        with st.spinner("Entraînement en cours..."):
            r = requests.post(f"{API}/ml/train")
            if r.status_code == 200:
                data = r.json()
                st.success(f"Modèle entraîné — Précision: {data.get('accuracy', 'N/A')}")
            else:
                st.error("Erreur lors de l'entraînement")

# ── Données principales ───────────────────────────────
summary_resp = requests.get(
    f"{API}/transactions/summary",
    params={"user_id": user_id, "month": month, "year": year}
)
transactions_resp = requests.get(
    f"{API}/transactions/",
    params={"user_id": user_id, "month": month, "year": year}
)
anomalies_resp = requests.get(f"{API}/ml/anomalies")

# ── Titre principal ───────────────────────────────────
months_fr = ["", "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
             "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"]
st.title(f"📊 {months_fr[month]} {year}")

# ── Métriques ─────────────────────────────────────────
if summary_resp.status_code == 200:
    summary = summary_resp.json()
    col1, col2, col3, col4 = st.columns(4)
    with col1:
        st.metric("💵 Revenus", f"{summary['total_income']:.0f} TND")
    with col2:
        st.metric("💸 Dépenses", f"{summary['total_expenses']:.0f} TND",
                  delta=f"-{summary['total_expenses']:.0f}", delta_color="inverse")
    with col3:
        saved = summary['total_income'] - summary['total_expenses']
        st.metric("💰 Épargne", f"{saved:.0f} TND")
    with col4:
        st.metric("📈 Taux d'épargne", f"{summary['savings_rate']}%")
else:
    st.warning("Aucune donnée pour cette période.")
    summary = None

st.markdown("---")

# ── Graphiques ────────────────────────────────────────
col_left, col_right = st.columns(2)

with col_left:
    st.subheader("🥧 Dépenses par catégorie")
    if summary and summary.get("categories"):
        df_cat = pd.DataFrame(summary["categories"])
        fig = px.pie(
            df_cat,
            names="category",
            values="total_spent",
            hole=0.4,
            color_discrete_sequence=px.colors.qualitative.Set3
        )
        fig.update_layout(margin=dict(t=0, b=0, l=0, r=0), height=300)
        st.plotly_chart(fig, use_container_width=True)
    else:
        st.info("Pas de données pour ce mois.")

with col_right:
    st.subheader("📅 Dépenses vs Budget")
    if summary and summary.get("categories"):
        df_cat = pd.DataFrame(summary["categories"])
        df_budget = df_cat[df_cat["budget_limit"].notna()].copy()
        if not df_budget.empty:
            fig = go.Figure()
            fig.add_trace(go.Bar(
                name="Dépensé",
                x=df_budget["category"],
                y=df_budget["total_spent"],
                marker_color="#e74c3c"
            ))
            fig.add_trace(go.Bar(
                name="Budget",
                x=df_budget["category"],
                y=df_budget["budget_limit"],
                marker_color="#2ecc71"
            ))
            fig.update_layout(
                barmode="group",
                margin=dict(t=0, b=0, l=0, r=0),
                height=300,
                legend=dict(orientation="h", y=1.1)
            )
            st.plotly_chart(fig, use_container_width=True)
        else:
            st.info("Aucun budget défini pour ce mois.")
    else:
        st.info("Pas de données pour ce mois.")

st.markdown("---")

# ── Tendances mensuelles ──────────────────────────────
st.subheader("📈 Tendances des dépenses")
all_tx_resp = requests.get(
    f"{API}/transactions/",
    params={"user_id": user_id}
)
if all_tx_resp.status_code == 200 and all_tx_resp.json():
    df_all = pd.DataFrame(all_tx_resp.json())
    df_all["date"] = pd.to_datetime(df_all["date"])
    df_all["month_label"] = df_all["date"].dt.strftime("%Y-%m")
    df_expenses = df_all[df_all["amount"] < 0].copy()
    df_expenses["amount"] = df_expenses["amount"].abs()
    monthly = df_expenses.groupby("month_label")["amount"].sum().reset_index()
    monthly.columns = ["Mois", "Total dépensé (TND)"]
    fig = px.line(
        monthly, x="Mois", y="Total dépensé (TND)",
        markers=True,
        color_discrete_sequence=["#3498db"]
    )
    fig.update_layout(margin=dict(t=10, b=0, l=0, r=0), height=250)
    st.plotly_chart(fig, use_container_width=True)

st.markdown("---")

# ── Prévisions ────────────────────────────────────────
col_forecast, col_anomalies = st.columns(2)

with col_forecast:
    st.subheader("🔮 Prévisions mois prochain")
    if st.button("Calculer les prévisions"):
        with st.spinner("Prophet en cours..."):
            r = requests.get(f"{API}/ml/forecast")
            if r.status_code == 200:
                forecast = r.json()
                st.metric(
                    "Total prévu",
                    f"{forecast['total_predicted']:.0f} TND",
                    help=forecast['forecast_month']
                )
                df_fc = pd.DataFrame([
                    {"Catégorie": k, "Prévu (TND)": v}
                    for k, v in forecast["by_category"].items()
                    if v is not None
                ])
                fig = px.bar(
                    df_fc, x="Catégorie", y="Prévu (TND)",
                    color="Prévu (TND)",
                    color_continuous_scale="Blues"
                )
                fig.update_layout(
                    margin=dict(t=0, b=0, l=0, r=0),
                    height=280,
                    showlegend=False
                )
                st.plotly_chart(fig, use_container_width=True)

with col_anomalies:
    st.subheader("⚠️ Anomalies détectées")
    if anomalies_resp.status_code == 200:
        anomalies_data = anomalies_resp.json()
        anomalies = anomalies_data.get("anomalies", [])
        if anomalies:
            for a in anomalies[:5]:
                st.markdown(f"""
                <div class="anomaly-card">
                    <strong>{a['description']}</strong> — {a['category']}<br>
                    <span style="color:#e74c3c;font-size:1.1em">
                        {a['amount']:.2f} TND
                    </span>
                    <span style="color:#888;font-size:0.85em">
                        &nbsp;· {a['date'][:10]}
                    </span>
                </div>
                """, unsafe_allow_html=True)
            if len(anomalies) > 5:
                st.caption(f"+ {len(anomalies) - 5} autres anomalies")
        else:
            st.success("Aucune anomalie détectée ✅")
    else:
        st.info("Lance la détection depuis le panneau gauche.")

st.markdown("---")

# ── Transactions récentes ─────────────────────────────
st.subheader("📋 Transactions récentes")
if transactions_resp.status_code == 200 and transactions_resp.json():
    df_tx = pd.DataFrame(transactions_resp.json())
    df_tx["date"] = pd.to_datetime(df_tx["date"]).dt.strftime("%Y-%m-%d")
    df_tx["amount"] = df_tx["amount"].round(2)
    df_tx["is_anomaly"] = df_tx["is_anomaly"].map(
        {True: "⚠️ Oui", False: "✅ Non"}
    )
    st.dataframe(
        df_tx[["date", "description", "category", "amount", "is_anomaly"]]
        .rename(columns={
            "date": "Date",
            "description": "Description",
            "category": "Catégorie",
            "amount": "Montant (TND)",
            "is_anomaly": "Anomalie"
        }),
        use_container_width=True,
        height=300
    )
else:
    st.info("Aucune transaction pour cette période.")

# ── Catégorisation ─────────────────────────────────────
st.markdown("---")
st.subheader("🤖 Catégoriser une transaction")
col_input, col_result = st.columns([2, 1])
with col_input:
    desc = st.text_input("Description de la transaction", placeholder="ex: Pharmacy, Uber, Netflix...")
    if st.button("Prédire la catégorie", use_container_width=True):
        if desc:
            r = requests.post(f"{API}/ml/categorize", json={"description": desc})
            if r.status_code == 200:
                result = r.json()
                with col_result:
                    st.metric("Catégorie", result["predicted_category"])
                    st.metric("Confiance", f"{result['confidence']}%")
        else:
            st.warning("Entre une description d'abord.")